import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FileText } from 'lucide-react';
import { useSalesOrders, SalesOrderStatus } from '@/hooks/useSalesOrders';
import { useVans } from '@/hooks/useVans';
import { useMyVanIds } from '@/hooks/useVanAssignments';
import { DataTable, Column } from '@/components/ui/DataTable';
import { PermissionGate } from '@/components/common/PermissionGate';
import type { SalesOrderRow } from '@/hooks/useSalesOrders';

const STATUS_STYLES: Record<SalesOrderStatus, string> = {
  draft: 'bg-slate-100 text-slate-600 dark:bg-slate-800',
  pending_validation: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30',
  validation_failed: 'bg-red-100 text-red-700 dark:bg-red-900/30',
  pending_submission: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30',
  submitted: 'bg-green-100 text-green-700 dark:bg-green-900/30',
  pending_approval: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30',
  partially_approved: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30',
  approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30',
  returned_for_correction: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30',
  on_hold: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30',
  ready_for_reservation: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30',
  partially_reserved: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30',
  fully_reserved: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30',
  backordered: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30',
  ready_for_fulfilment: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30',
  partially_converted: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30',
  fully_converted: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30',
  expired: 'bg-slate-200 text-slate-500 dark:bg-slate-700',
  closed: 'bg-slate-200 text-slate-400 dark:bg-slate-700',
  sync_pending: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30',
  sync_failed: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30',
  conflict: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30',
};

export function SalesOrdersListPage() {
  const navigate = useNavigate();
  const [dateFrom, setDateFrom] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<SalesOrderStatus | ''>('');
  const [vanId, setVanId] = useState('');
  const { vans } = useVans();
  const myVanIds = useMyVanIds();
  const accessibleVans = myVanIds === null ? vans : vans.filter((v) => myVanIds.has(v.id));

  const { orders, loading, submitOrder, deleteDraft } = useSalesOrders({
    dateFrom, dateTo, status: status || undefined, vanId: vanId || undefined,
  });

  const columns: Column<SalesOrderRow>[] = [
    {
      key: 'order_number', header: 'Order #', sortValue: (r) => r.order_number,
      render: (r) => (
        <button className="font-medium text-blue-600 hover:underline dark:text-blue-400" onClick={() => navigate(`/sales/orders/${r.id}`)}>
          {r.order_number}
        </button>
      ),
    },
    { key: 'order_date', header: 'Date', sortValue: (r) => r.order_date },
    { key: 'customer', header: 'Customer', render: (r) => r.customer ? `${r.customer.customer_code} — ${r.customer.business_name}` : '—' },
    { key: 'order_type', header: 'Type', render: (r) => r.order_type?.label ?? '—' },
    { key: 'van', header: 'Van', render: (r) => r.van ? `${r.van.code} — ${r.van.name}` : '—' },
    { key: 'salesman', header: 'Salesman', render: (r) => r.salesman?.full_name ?? '—' },
    { key: 'total_quantity', header: 'Qty', sortValue: (r) => r.total_quantity },
    { key: 'net_amount', header: 'Net Amount', sortValue: (r) => r.net_amount, render: (r) => r.net_amount.toFixed(2) },
    {
      key: 'status', header: 'Status',
      render: (r) => <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[r.status]}`}>{r.status.replace(/_/g, ' ')}</span>,
    },
    {
      key: 'actions', header: '', className: 'text-right',
      render: (r) => (
        <div className="flex justify-end gap-2 text-xs">
          {(r.status === 'draft' || r.status === 'pending_submission') && (
            <PermissionGate permission="sales_orders:submit">
              <button className="text-green-600 hover:underline" onClick={() => submitOrder(r.id)}>Submit</button>
            </PermissionGate>
          )}
          {r.status === 'draft' && (
            <PermissionGate permission="sales_orders:delete_draft">
              <button className="text-red-600 hover:underline" onClick={() => deleteDraft(r.id)}>Delete</button>
            </PermissionGate>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-slate-100">
            <FileText size={20} /> Sales Orders
          </h1>
          <p className="text-sm text-slate-500">Van Sales, Pre-Sales, and all other configurable order types.</p>
        </div>
        <PermissionGate permission="sales_orders:create">
          <button className="btn-primary" onClick={() => navigate('/sales/orders/new')}>
            <Plus size={16} /> New Order
          </button>
        </PermissionGate>
      </div>

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="label">From</label>
          <input type="date" className="input" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" className="input" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <div>
          <label className="label">Status</label>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as SalesOrderStatus | '')}>
            <option value="">All</option>
            {(['draft', 'pending_approval', 'partially_approved', 'approved', 'rejected', 'on_hold', 'fully_reserved', 'backordered', 'cancelled', 'expired', 'sync_pending', 'sync_failed', 'conflict'] as SalesOrderStatus[]).map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Van</label>
          <select className="input" value={vanId} onChange={(e) => setVanId(e.target.value)}>
            <option value="">All</option>
            {accessibleVans.map((v) => <option key={v.id} value={v.id}>{v.code} — {v.name}</option>)}
          </select>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={orders}
        rowKey={(r) => r.id}
        loading={loading}
        searchPlaceholder="Search order #, customer, phone…"
        searchFn={(r, q) => {
          const query = q.toLowerCase();
          return r.order_number.toLowerCase().includes(query)
            || (r.customer?.business_name.toLowerCase().includes(query) ?? false)
            || (r.customer?.customer_code.toLowerCase().includes(query) ?? false)
            || (r.customer?.primary_phone?.includes(q) ?? false);
        }}
        exportFilename="sales_orders"
      />
    </div>
  );
}
