import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface TrendPoint { date: string; total: number; }
export interface TopProductRow { product_id: string; name: string; quantity: number; revenue: number; }
export interface TopCustomerRow { customer_id: string; name: string; revenue: number; orders: number; }
export interface SalesmanRow { salesman_id: string; name: string; revenue: number; orders: number; }
export interface VanSalesRow { van_id: string; name: string; revenue: number; orders: number; }
export interface LowStockRow { product_id: string; name: string; sku: string; warehouse: string; quantity: number; min_stock: number; }
export interface ExpiryRow { product_id: string; name: string; batch_no: string; warehouse: string; quantity: number; expiry_date: string; daysLeft: number; }

function endOfDay(date: string) { return `${date}T23:59:59`; }

export function useReports(startDate: string, endDate: string) {
  const { company } = useAuth();
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [topProducts, setTopProducts] = useState<TopProductRow[]>([]);
  const [topCustomers, setTopCustomers] = useState<TopCustomerRow[]>([]);
  const [salesmen, setSalesmen] = useState<SalesmanRow[]>([]);
  const [vans, setVans] = useState<VanSalesRow[]>([]);
  const [lowStock, setLowStock] = useState<LowStockRow[]>([]);
  const [expiring, setExpiring] = useState<ExpiryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);

    const [
      { data: sales },
      { data: saleItems },
      { data: stockRows },
      { data: batchRows },
    ] = await Promise.all([
      supabase
        .from('sales')
        .select('id, created_at, total_amount, customer_id, salesman_id, van_id, customer:customers(business_name), salesman:app_users(full_name), van:vans(name)')
        .eq('company_id', company.id).eq('status', 'completed')
        .gte('created_at', startDate).lte('created_at', endOfDay(endDate)),
      supabase
        .from('sale_items')
        .select('quantity, line_total, product_id, product:products(name), sale:sales!inner(company_id, created_at, status)')
        .eq('sale.company_id', company.id).eq('sale.status', 'completed')
        .gte('sale.created_at', startDate).lte('sale.created_at', endOfDay(endDate)),
      supabase
        .from('warehouse_stock')
        .select('quantity, product:products!inner(id,name,sku,min_stock,company_id), warehouse:warehouses(name)')
        .eq('product.company_id', company.id),
      supabase
        .from('batches')
        .select('id, batch_no, expiry_date, product:products!inner(id,name,company_id)')
        .eq('product.company_id', company.id)
        .not('expiry_date', 'is', null)
        .lte('expiry_date', new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10))
        .order('expiry_date', { ascending: true }),
    ]);

    // --- Sales trend (by day) ---
    const trendMap = new Map<string, number>();
    for (const s of sales ?? []) {
      const day = s.created_at.slice(0, 10);
      trendMap.set(day, (trendMap.get(day) ?? 0) + s.total_amount);
    }
    setTrend(Array.from(trendMap.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, total]) => ({ date, total })));

    // --- Top products ---
    const productMap = new Map<string, TopProductRow>();
    for (const it of (saleItems ?? []) as any[]) {
      const key = it.product_id;
      const existing = productMap.get(key) ?? { product_id: key, name: it.product?.name ?? '—', quantity: 0, revenue: 0 };
      existing.quantity += it.quantity;
      existing.revenue += it.line_total;
      productMap.set(key, existing);
    }
    setTopProducts(Array.from(productMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 10));

    // --- Top customers & salesman performance (from sales) ---
    const customerMap = new Map<string, TopCustomerRow>();
    const salesmanMap = new Map<string, SalesmanRow>();
    const vanMap = new Map<string, VanSalesRow>();
    for (const s of (sales ?? []) as any[]) {
      if (s.customer_id) {
        const existing = customerMap.get(s.customer_id) ?? { customer_id: s.customer_id, name: s.customer?.business_name ?? 'Walk-in', revenue: 0, orders: 0 };
        existing.revenue += s.total_amount;
        existing.orders += 1;
        customerMap.set(s.customer_id, existing);
      }
      if (s.salesman_id) {
        const existing = salesmanMap.get(s.salesman_id) ?? { salesman_id: s.salesman_id, name: s.salesman?.full_name ?? '—', revenue: 0, orders: 0 };
        existing.revenue += s.total_amount;
        existing.orders += 1;
        salesmanMap.set(s.salesman_id, existing);
      }
      if (s.van_id) {
        const existing = vanMap.get(s.van_id) ?? { van_id: s.van_id, name: s.van?.name ?? '—', revenue: 0, orders: 0 };
        existing.revenue += s.total_amount;
        existing.orders += 1;
        vanMap.set(s.van_id, existing);
      }
    }
    setTopCustomers(Array.from(customerMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 10));
    setSalesmen(Array.from(salesmanMap.values()).sort((a, b) => b.revenue - a.revenue));
    setVans(Array.from(vanMap.values()).sort((a, b) => b.revenue - a.revenue));

    // --- Low stock ---
    const low = ((stockRows ?? []) as any[])
      .filter((r) => r.quantity <= (r.product?.min_stock ?? 0))
      .map((r) => ({
        product_id: r.product.id, name: r.product.name, sku: r.product.sku,
        warehouse: r.warehouse?.name ?? '—', quantity: r.quantity, min_stock: r.product.min_stock,
      }));
    setLowStock(low);

    // --- Expiring batches (need current warehouse quantity too) ---
    const expiryRows: ExpiryRow[] = [];
    for (const b of (batchRows ?? []) as any[]) {
      const { data: stockForBatch } = await supabase
        .from('warehouse_stock')
        .select('quantity, warehouse:warehouses(name)')
        .eq('batch_id', b.id)
        .gt('quantity', 0);
      for (const s of (stockForBatch ?? []) as any[]) {
        const daysLeft = Math.ceil((new Date(b.expiry_date).getTime() - Date.now()) / 86400000);
        expiryRows.push({
          product_id: b.product.id, name: b.product.name, batch_no: b.batch_no,
          warehouse: s.warehouse?.name ?? '—', quantity: s.quantity, expiry_date: b.expiry_date, daysLeft,
        });
      }
    }
    setExpiring(expiryRows.sort((a, b) => a.daysLeft - b.daysLeft));

    setLoading(false);
  }, [company, startDate, endDate]);

  useEffect(() => { load(); }, [load]);

  const totalRevenue = trend.reduce((sum, t) => sum + t.total, 0);
  const totalOrders = salesmen.reduce((sum, s) => sum + s.orders, 0);

  return { trend, topProducts, topCustomers, salesmen, vans, lowStock, expiring, loading, totalRevenue, totalOrders, reload: load };
}
