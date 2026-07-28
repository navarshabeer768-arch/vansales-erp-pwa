import { useEffect, useState } from 'react';
import { Boxes, Warehouse, Truck, Users, TrendingUp } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

interface Kpis {
  productCount: number;
  warehouseCount: number;
  vanCount: number;
  customerCount: number;
  lowStockCount: number;
}

function KpiCard({ icon: Icon, label, value, accent }: { icon: React.ElementType; label: string; value: number | string; accent: string }) {
  return (
    <div className="card flex items-center gap-4 p-5">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${accent}`}>
        <Icon size={20} />
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{value}</p>
        <p className="text-sm text-slate-500">{label}</p>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { company, user } = useAuth();
  const [kpis, setKpis] = useState<Kpis | null>(null);

  useEffect(() => {
    if (!company) return;
    (async () => {
      const [products, warehouses, vans, customers] = await Promise.all([
        supabase.from('products').select('id', { count: 'exact', head: true }).eq('company_id', company.id).eq('is_active', true),
        supabase.from('warehouses').select('id', { count: 'exact', head: true }).eq('company_id', company.id),
        supabase.from('vans').select('id', { count: 'exact', head: true }).eq('company_id', company.id),
        supabase.from('customers').select('id', { count: 'exact', head: true }).eq('company_id', company.id),
      ]);

      const { data: lowStockRows } = await supabase
        .from('warehouse_stock')
        .select('product_id, quantity, product:products!inner(min_stock, company_id)')
        .eq('product.company_id', company.id);

      const lowStockCount = (lowStockRows ?? []).filter(
        (r: any) => r.quantity <= (r.product?.min_stock ?? 0)
      ).length;

      setKpis({
        productCount: products.count ?? 0,
        warehouseCount: warehouses.count ?? 0,
        vanCount: vans.count ?? 0,
        customerCount: customers.count ?? 0,
        lowStockCount,
      });
    })();
  }, [company]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">
          Welcome back{user?.full_name ? `, ${user.full_name.split(' ')[0]}` : ''}
        </h1>
        <p className="text-sm text-slate-500">{company?.name} — here's what's happening today.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={Boxes} label="Active products" value={kpis?.productCount ?? '—'} accent="bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300" />
        <KpiCard icon={Warehouse} label="Warehouses" value={kpis?.warehouseCount ?? '—'} accent="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" />
        <KpiCard icon={Truck} label="Vans" value={kpis?.vanCount ?? '—'} accent="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" />
        <KpiCard icon={Users} label="Customers" value={kpis?.customerCount ?? '—'} accent="bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300" />
      </div>

      {kpis && kpis.lowStockCount > 0 && (
        <div className="card flex items-center gap-3 border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-900/20">
          <TrendingUp className="text-amber-600" size={20} />
          <p className="text-sm text-amber-800 dark:text-amber-300">
            <strong>{kpis.lowStockCount}</strong> product{kpis.lowStockCount === 1 ? '' : 's'} at or below minimum stock across your warehouses.
          </p>
        </div>
      )}

      <div className="card p-6">
        <h2 className="mb-2 font-semibold text-slate-800 dark:text-slate-100">Getting started</h2>
        <ol className="list-inside list-decimal space-y-1 text-sm text-slate-600 dark:text-slate-300">
          <li>Add your units, categories, brands, and suppliers under Inventory → Catalog settings.</li>
          <li>Create your warehouses and register your product catalog.</li>
          <li>Record opening stock via a Stock Adjustment (type: Correction) once a warehouse exists.</li>
          <li>Vans, routes, and sales open up once stock is in place — coming in the next build phase.</li>
        </ol>
      </div>
    </div>
  );
}
