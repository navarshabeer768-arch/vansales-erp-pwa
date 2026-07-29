import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { AlertTriangle, PackageX } from 'lucide-react';
import { useReports } from '@/hooks/useReports';
import { DataTable, Column } from '@/components/ui/DataTable';
import type { TopProductRow, TopCustomerRow, SalesmanRow, LowStockRow, ExpiryRow } from '@/hooks/useReports';

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function ReportsPage() {
  const [startDate, setStartDate] = useState(isoDaysAgo(30));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const { trend, topProducts, topCustomers, salesmen, lowStock, expiring, loading, totalRevenue, totalOrders } =
    useReports(startDate, endDate);

  const productColumns: Column<TopProductRow>[] = [
    { key: 'name', header: 'Product', render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'quantity', header: 'Qty sold', sortValue: (r) => r.quantity, render: (r) => r.quantity },
    { key: 'revenue', header: 'Revenue', sortValue: (r) => r.revenue, render: (r) => r.revenue.toFixed(2) },
  ];
  const customerColumns: Column<TopCustomerRow>[] = [
    { key: 'name', header: 'Customer', render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'orders', header: 'Orders', sortValue: (r) => r.orders },
    { key: 'revenue', header: 'Revenue', sortValue: (r) => r.revenue, render: (r) => r.revenue.toFixed(2) },
  ];
  const salesmanColumns: Column<SalesmanRow>[] = [
    { key: 'name', header: 'Salesman', render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'orders', header: 'Orders', sortValue: (r) => r.orders },
    { key: 'revenue', header: 'Revenue', sortValue: (r) => r.revenue, render: (r) => r.revenue.toFixed(2) },
  ];
  const lowStockColumns: Column<LowStockRow>[] = [
    { key: 'name', header: 'Product', render: (r) => <div><p className="font-medium">{r.name}</p><p className="text-xs text-slate-500">{r.sku}</p></div> },
    { key: 'warehouse', header: 'Warehouse' },
    { key: 'quantity', header: 'On hand', render: (r) => <span className="font-semibold text-red-600">{r.quantity}</span> },
    { key: 'min_stock', header: 'Min. stock', render: (r) => r.min_stock },
  ];
  const expiryColumns: Column<ExpiryRow>[] = [
    { key: 'name', header: 'Product', render: (r) => <div><p className="font-medium">{r.name}</p><p className="text-xs text-slate-500">Batch {r.batch_no}</p></div> },
    { key: 'warehouse', header: 'Warehouse' },
    { key: 'quantity', header: 'Qty', render: (r) => r.quantity },
    { key: 'expiry', header: 'Expires', sortValue: (r) => r.daysLeft, render: (r) => (
      <span className={r.daysLeft < 0 ? 'badge-red' : r.daysLeft <= 7 ? 'badge-amber' : 'badge-slate'}>
        {r.daysLeft < 0 ? 'Expired' : `${r.daysLeft}d left`}
      </span>
    ) },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Reports</h1>
        <p className="text-sm text-slate-500">Sales performance, top movers, and stock health over any date range.</p>
      </div>

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="label">From</label>
          <input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <div className="ml-auto flex gap-6 text-right">
          <div>
            <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{totalRevenue.toFixed(2)}</p>
            <p className="text-xs text-slate-500">Total revenue</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{totalOrders}</p>
            <p className="text-xs text-slate-500">Orders</p>
          </div>
        </div>
      </div>

      <div className="card p-4">
        <h2 className="mb-3 font-semibold text-slate-800 dark:text-slate-100">Sales trend</h2>
        {loading ? (
          <p className="py-10 text-center text-slate-400">Loading…</p>
        ) : trend.length === 0 ? (
          <p className="py-10 text-center text-slate-400">No sales in this range.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v: number) => v.toFixed(2)} />
              <Line type="monotone" dataKey="total" stroke="#1D4ED8" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div>
          <h2 className="mb-2 font-semibold text-slate-800 dark:text-slate-100">Top products</h2>
          <DataTable columns={productColumns} rows={topProducts} rowKey={(r) => r.product_id} loading={loading} emptyMessage="No sales yet." />
        </div>
        <div>
          <h2 className="mb-2 font-semibold text-slate-800 dark:text-slate-100">Top customers</h2>
          <DataTable columns={customerColumns} rows={topCustomers} rowKey={(r) => r.customer_id} loading={loading} emptyMessage="No sales yet." />
        </div>
        <div>
          <h2 className="mb-2 font-semibold text-slate-800 dark:text-slate-100">Salesman performance</h2>
          <DataTable columns={salesmanColumns} rows={salesmen} rowKey={(r) => r.salesman_id} loading={loading} emptyMessage="No sales yet." />
        </div>
      </div>

      <div>
        <h2 className="mb-2 flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100">
          <PackageX size={18} className="text-red-500" /> Low stock (at or below minimum)
        </h2>
        <DataTable columns={lowStockColumns} rows={lowStock} rowKey={(r) => `${r.product_id}-${r.warehouse}`} loading={loading} emptyMessage="Nothing below minimum stock." />
      </div>

      <div>
        <h2 className="mb-2 flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100">
          <AlertTriangle size={18} className="text-amber-500" /> Expiring within 30 days
        </h2>
        <DataTable columns={expiryColumns} rows={expiring} rowKey={(r) => `${r.product_id}-${r.batch_no}-${r.warehouse}`} loading={loading} emptyMessage="Nothing expiring soon." />
      </div>
    </div>
  );
}
