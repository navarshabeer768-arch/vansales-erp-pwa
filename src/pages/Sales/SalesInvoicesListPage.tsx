import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Receipt } from 'lucide-react';
import { useSalesInvoices, SalesInvoiceStatus } from '@/hooks/useSalesInvoices';
import { useVans } from '@/hooks/useVans';
import { useMyVanIds } from '@/hooks/useVanAssignments';
import { DataTable, Column } from '@/components/ui/DataTable';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';
import type { SalesInvoiceRow } from '@/hooks/useSalesInvoices';

const STATUS_STYLES: Record<SalesInvoiceStatus, string> = {
  draft: 'bg-slate-100 text-slate-600 dark:bg-slate-800',
  pending_validation: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30',
  validation_failed: 'bg-red-100 text-red-700 dark:bg-red-900/30',
  pending_submission: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30',
  pending_approval: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30',
  partially_approved: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30',
  approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30',
  submitted: 'bg-green-100 text-green-700 dark:bg-green-900/30',
  returned_for_correction: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30',
  on_hold: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30',
  ready_to_post: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30',
  posting: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30',
  posted: 'bg-emerald-200 text-emerald-800 dark:bg-emerald-900/50',
  posting_failed: 'bg-red-100 text-red-700 dark:bg-red-900/30',
  cancelled_before_posting: 'bg-red-100 text-red-700 dark:bg-red-900/30',
  void_requested: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30',
  voided: 'bg-slate-200 text-slate-500 dark:bg-slate-700',
  expired: 'bg-slate-200 text-slate-500 dark:bg-slate-700',
  sync_pending: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30',
  sync_failed: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30',
  conflict: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30',
};

export function SalesInvoicesListPage() {
  const navigate = useNavigate();
  const [dateFrom, setDateFrom] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<SalesInvoiceStatus | ''>('');
  const [vanId, setVanId] = useState('');
  const { vans } = useVans();
  const myVanIds = useMyVanIds();
  const accessibleVans = myVanIds === null ? vans : vans.filter((v) => myVanIds.has(v.id));
  const { push } = useToast();

  const { invoices, loading, submitInvoice, cancelInvoice, createRepeatInvoice } = useSalesInvoices({
    dateFrom, dateTo, status: status || undefined, vanId: vanId || undefined,
  });

  const handleCancel = async (id: string) => {
    const reason = prompt('Reason for cancelling this draft:');
    if (!reason) return;
    const { error } = await cancelInvoice(id, reason);
    if (error) push('error', error); else push('success', 'Draft cancelled.');
  };

  const handleRepeat = async (id: string) => {
    const { data, error } = await createRepeatInvoice(id);
    if (error) { push('error', error); return; }
    push('success', 'Repeat invoice created — prices/promotions revalidated against current rules.');
    if (data) navigate(`/sales/invoices/${data}`);
  };

  const columns: Column<SalesInvoiceRow>[] = [
    {
      key: 'invoice_number', header: 'Invoice #', sortValue: (r) => r.invoice_number,
      render: (r) => (
        <button className="font-medium text-blue-600 hover:underline dark:text-blue-400" onClick={() => navigate(`/sales/invoices/${r.id}`)}>
          {r.invoice_number}
        </button>
      ),
    },
    { key: 'invoice_date', header: 'Date', sortValue: (r) => r.invoice_date },
    { key: 'customer', header: 'Customer', render: (r) => r.customer ? `${r.customer.customer_code} — ${r.customer.business_name}` : (r.walk_in_name ? `Walk-in: ${r.walk_in_name}` : '—') },
    { key: 'invoice_type', header: 'Type', render: (r) => r.invoice_type?.label ?? '—' },
    { key: 'sales_order_id', header: 'Order?', render: (r) => r.sales_order_id ? 'From Order' : 'Direct' },
    { key: 'van', header: 'Van', render: (r) => r.van ? `${r.van.code} — ${r.van.name}` : '—' },
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
            <PermissionGate permission="sales_invoices:create">
              <button className="text-green-600 hover:underline" onClick={() => submitInvoice(r.id)}>Submit</button>
            </PermissionGate>
          )}
          {r.status !== 'cancelled_before_posting' && (
            <PermissionGate permission="sales_invoices:cancel_draft">
              <button className="text-red-600 hover:underline" onClick={() => handleCancel(r.id)}>Cancel</button>
            </PermissionGate>
          )}
          <PermissionGate permission="sales_invoices:create">
            <button className="text-blue-600 hover:underline" onClick={() => handleRepeat(r.id)}>Repeat</button>
          </PermissionGate>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-slate-100">
            <Receipt size={20} /> Sales Invoices
          </h1>
          <p className="text-sm text-slate-500">Draft invoices — nothing here is posted or finalized yet.</p>
        </div>
        <PermissionGate permission="sales_invoices:create">
          <button className="btn-primary" onClick={() => navigate('/sales/invoices/new')}>
            <Plus size={16} /> New Invoice
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
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as SalesInvoiceStatus | '')}>
            <option value="">All</option>
            {(['draft', 'pending_approval', 'approved', 'ready_to_post', 'posted', 'posting_failed', 'on_hold', 'cancelled_before_posting', 'sync_pending', 'sync_failed', 'conflict'] as SalesInvoiceStatus[]).map((s) => (
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
        rows={invoices}
        rowKey={(r) => r.id}
        loading={loading}
        searchPlaceholder="Search invoice #, customer, phone…"
        searchFn={(r, q) => {
          const query = q.toLowerCase();
          return r.invoice_number.toLowerCase().includes(query)
            || (r.customer?.business_name.toLowerCase().includes(query) ?? false)
            || (r.walk_in_name?.toLowerCase().includes(query) ?? false)
            || (r.customer?.primary_phone?.includes(q) ?? false);
        }}
        exportFilename="sales_invoices"
      />
    </div>
  );
}
