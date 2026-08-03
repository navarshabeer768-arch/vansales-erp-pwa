import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Undo2 } from 'lucide-react';
import { useSalesReturns, SalesReturnStatus } from '@/hooks/useSalesReturns';
import { useVans } from '@/hooks/useVans';
import { useMyVanIds } from '@/hooks/useVanAssignments';
import { DataTable, Column } from '@/components/ui/DataTable';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';
import type { SalesReturnRow } from '@/hooks/useSalesReturns';

const STATUS_STYLES: Record<SalesReturnStatus, string> = {
  draft: 'bg-slate-100 text-slate-600 dark:bg-slate-800',
  pending_validation: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30',
  validation_failed: 'bg-red-100 text-red-700 dark:bg-red-900/30',
  pending_approval: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30',
  partially_approved: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30',
  approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30',
  submitted: 'bg-green-100 text-green-700 dark:bg-green-900/30',
  returned_for_correction: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30',
  on_hold: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30',
  pending_inspection: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30',
  inspection_in_progress: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30',
  partially_accepted: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30',
  accepted: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30',
  ready_to_post: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30',
  posting: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30',
  posted: 'bg-emerald-200 text-emerald-800 dark:bg-emerald-900/50',
  posting_failed: 'bg-red-100 text-red-700 dark:bg-red-900/30',
  replacement_pending: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30',
  replacement_approved: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30',
  replacement_completed: 'bg-purple-200 text-purple-800 dark:bg-purple-900/50',
  credit_note_pending: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30',
  credit_note_generated: 'bg-cyan-200 text-cyan-800 dark:bg-cyan-900/50',
  cancelled_before_posting: 'bg-red-100 text-red-700 dark:bg-red-900/30',
  reversal_requested: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30',
  reversed: 'bg-slate-200 text-slate-500 dark:bg-slate-700',
  expired: 'bg-slate-200 text-slate-500 dark:bg-slate-700',
  sync_pending: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30',
  sync_failed: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30',
  conflict: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30',
  pending_submission: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30',
};

export function SalesReturnsListPage() {
  const navigate = useNavigate();
  const [dateFrom, setDateFrom] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<SalesReturnStatus | ''>('');
  const [vanId, setVanId] = useState('');
  const { vans } = useVans();
  const myVanIds = useMyVanIds();
  const accessibleVans = myVanIds === null ? vans : vans.filter((v) => myVanIds.has(v.id));
  const { push } = useToast();

  const { returns, loading, submitReturn, cancelReturn } = useSalesReturns({
    dateFrom, dateTo, status: status || undefined, vanId: vanId || undefined,
  });

  const handleCancel = async (id: string) => {
    const reason = prompt('Reason for cancelling this draft:');
    if (!reason) return;
    const { error } = await cancelReturn(id, reason);
    if (error) push('error', error); else push('success', 'Draft cancelled.');
  };

  const columns: Column<SalesReturnRow>[] = [
    {
      key: 'return_number', header: 'Return #', sortValue: (r) => r.return_number,
      render: (r) => (
        <button className="font-medium text-blue-600 hover:underline dark:text-blue-400" onClick={() => navigate(`/sales/returns/${r.id}`)}>
          {r.return_number}
        </button>
      ),
    },
    { key: 'return_date', header: 'Date', sortValue: (r) => r.return_date },
    { key: 'customer', header: 'Customer', render: (r) => r.customer ? `${r.customer.customer_code} — ${r.customer.business_name}` : '—' },
    { key: 'return_type', header: 'Type', render: (r) => r.return_type?.label ?? '—' },
    { key: 'van', header: 'Van', render: (r) => r.van ? `${r.van.code} — ${r.van.name}` : '—' },
    { key: 'net_return_amount', header: 'Net Amount', sortValue: (r) => r.net_return_amount, render: (r) => r.net_return_amount.toFixed(2) },
    { key: 'replacement_requested', header: 'Replacement', render: (r) => r.replacement_requested ? 'Yes' : '—' },
    {
      key: 'status', header: 'Status',
      render: (r) => <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[r.status]}`}>{r.status.replace(/_/g, ' ')}</span>,
    },
    {
      key: 'actions', header: '', className: 'text-right',
      render: (r) => (
        <div className="flex justify-end gap-2 text-xs">
          {(r.status === 'draft' || r.status === 'pending_submission') && (
            <PermissionGate permission="sales_returns:create">
              <button className="text-green-600 hover:underline" onClick={() => submitReturn(r.id)}>Submit</button>
            </PermissionGate>
          )}
          {r.status !== 'cancelled_before_posting' && (
            <PermissionGate permission="sales_returns:cancel_return_draft">
              <button className="text-red-600 hover:underline" onClick={() => handleCancel(r.id)}>Cancel</button>
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
            <Undo2 size={20} /> Sales Returns
          </h1>
          <p className="text-sm text-slate-500">Draft returns — nothing here has posted, adjusted stock, or affected a customer balance yet.</p>
        </div>
        <PermissionGate permission="sales_returns:create">
          <button className="btn-primary" onClick={() => navigate('/sales/returns/new')}>
            <Plus size={16} /> New Return
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
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as SalesReturnStatus | '')}>
            <option value="">All</option>
            {(['draft', 'pending_approval', 'approved', 'pending_inspection', 'partially_accepted', 'accepted', 'rejected', 'ready_to_post', 'posted', 'on_hold', 'reversal_requested', 'reversed', 'cancelled_before_posting', 'sync_pending', 'sync_failed', 'conflict'] as SalesReturnStatus[]).map((s) => (
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
        rows={returns}
        rowKey={(r) => r.id}
        loading={loading}
        searchPlaceholder="Search return #, customer…"
        searchFn={(r, q) => {
          const query = q.toLowerCase();
          return r.return_number.toLowerCase().includes(query) || (r.customer?.business_name.toLowerCase().includes(query) ?? false);
        }}
        exportFilename="sales_returns"
      />
    </div>
  );
}
