import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { SalesOrderStatus } from './useSalesOrders';

export interface SalesOrderDetail {
  id: string;
  order_number: string;
  is_manual_number: boolean;
  order_date: string;
  expected_delivery_date: string | null;
  status: SalesOrderStatus;
  customer_reference: string | null;
  customer_po: string | null;
  notes: string | null;
  internal_notes: string | null;
  is_direct_order: boolean;
  direct_order_type: string | null;
  currency: string;
  exchange_rate: number;
  gross_amount: number;
  discount_amount: number;
  promotion_discount_amount: number;
  tax_amount: number;
  round_off: number;
  net_amount: number;
  total_quantity: number;
  free_quantity: number;
  base_quantity: number;
  order_weight: number;
  order_volume: number;
  is_on_hold: boolean;
  approval_status: string;
  credit_validation_status: string;
  stock_validation_status: string;
  customer: { customer_code: string; business_name: string } | null;
  order_type: { code: string; label: string } | null;
  route: { name: string } | null;
  beat_plan: { beat_name: string } | null;
  daily_visit_plan: { plan_date: string } | null;
  van: { code: string; name: string } | null;
  warehouse: { code: string; name: string } | null;
  salesman: { full_name: string } | null;
  payment_term: { label: string } | null;
}

export interface SalesOrderItemDetail {
  id: string;
  product_id: string;
  sequence: number;
  sku: string | null;
  description: string | null;
  ordered_quantity: number;
  base_quantity: number;
  original_price: number;
  applied_price: number;
  price_source: string | null;
  discount_pct: number;
  discount_amount: number;
  discount_source: string | null;
  tax_rate: number;
  tax_amount: number;
  gross_amount: number;
  net_amount: number;
  is_free_item: boolean;
  item_notes: string | null;
  product?: { name: string } | null;
  unit?: { symbol: string } | null;
}

export function useSalesOrderDetail(orderId: string | undefined) {
  const [order, setOrder] = useState<SalesOrderDetail | null>(null);
  const [items, setItems] = useState<SalesOrderItemDetail[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    const [{ data: orderData }, { data: itemsData }] = await Promise.all([
      supabase.from('sales_orders').select(`
        *, customer:customers(customer_code, business_name), order_type:sales_order_types(code, label),
        route:routes(name), beat_plan:beat_plans(beat_name), daily_visit_plan:daily_visit_plans(plan_date),
        van:vans(code, name), warehouse:warehouses(code, name),
        salesman:app_users!sales_orders_salesman_id_fkey(full_name), payment_term:payment_terms(label)
      `).eq('id', orderId).single(),
      supabase.from('sales_order_items').select('*, product:products(name), unit:units(symbol)').eq('order_id', orderId).order('sequence'),
    ]);
    setOrder(orderData as unknown as SalesOrderDetail | null);
    setItems((itemsData ?? []) as unknown as SalesOrderItemDetail[]);
    setLoading(false);
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  return { order, items, loading, reload: load };
}

export interface SalesOrderNote {
  id: string; note: string; note_type: string; created_by: string | null; created_at: string;
}

export function useSalesOrderNotes(orderId: string | undefined) {
  const { user, company } = useAuth();
  const [notes, setNotes] = useState<SalesOrderNote[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    const { data } = await supabase.from('sales_order_notes').select('*').eq('order_id', orderId).order('created_at', { ascending: false });
    setNotes((data ?? []) as SalesOrderNote[]);
    setLoading(false);
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  const addNote = useCallback(async (note: string, noteType: SalesOrderNote['note_type'] = 'general') => {
    if (!orderId || !user || !company) return { error: 'Missing context' };
    const { error } = await supabase.from('sales_order_notes').insert({
      order_id: orderId, note, note_type: noteType, created_by: user.id, company_id: company.id,
    });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [orderId, user, company, load]);

  return { notes, loading, addNote };
}

export interface SalesOrderStatusHistoryRow {
  id: string; old_status: string | null; new_status: string; reason: string | null; changed_by: string | null; changed_at: string;
}

export function useSalesOrderStatusHistory(orderId: string | undefined) {
  const [history, setHistory] = useState<SalesOrderStatusHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase.from('sales_order_status_history').select('*').eq('order_id', orderId).order('changed_at', { ascending: false });
      setHistory((data ?? []) as SalesOrderStatusHistoryRow[]);
      setLoading(false);
    })();
  }, [orderId]);

  return { history, loading };
}
