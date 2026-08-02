import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Receipt } from 'lucide-react';
import { useReceiptVouchers, ReceiptStatus } from '@/hooks/useReceiptVouchers';
import { useVans } from '@/hooks/useVans';
import { useMyVanIds } from '@/hooks/useVanAssignments';
import { DataTable, Column } from '@/components/ui/DataTable';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';
import type { ReceiptVoucherRow } from '@/hooks/useReceiptVouchers';

const STATUS_STYLES: Record<ReceiptStatus, string> = {
  draft: 'bg-slate-100 text-slate-600 dark:bg-slate-800',
  pending_submission: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30',
  submitted: 'bg-green-100 text-green-700 dark:bg-green-900/30',
  returned_for_correction: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30',
  cancelled_before_posting: 'bg-red-100 text-red-700 dark:bg-red-900/30',
  expired: 'bg-slate-200 text-slate-500 dark:bg-slate-700',
  sync_pending: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30',
  sync_failed: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30',
  conflict: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30',
};

export function ReceiptVouchersListPage() {
  const navigate = useNavigate();
  const [dateFrom, setDateFrom] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<ReceiptStatus | ''>('');
  const [vanId, setVanId] = useState('');
  const { vans } = useVans();
  const myVanIds = useMyVanIds();
  const accessibleVans = myVanIds === null ? vans : vans.filter((v) => myVanIds.has(v.id));
  const { push } = useToast();

  const { receipts, loading, submitReceipt, cancelReceipt } = useReceiptVouchers({
    dateFrom, dateTo, status: status || undefined, vanId: vanId || undefined,
  });

  const handleCancel = async (id: string) => {
    const reason = prompt('Reason for cancelling this draft:');
    if (!reason) return;
    const { error } = await cancelReceipt(id, reason);
    if (error) push('error', error); else push('success', 'Draft cancelled.');
  };

  const columns: Column<ReceiptVoucherRow>[] = [
    {
      key: 'receipt_number', header: 'Receipt #', sortValue: (r) => r.receipt_number,
      render: (r) => (
        <button className="font-medium text-blue-600 hover:underline dark:text-blue-400" onClick={() => navigate(`/collections/receipts/${r.id}`)}>
          {r.receipt_number}
        </button>
      ),
    },
    { key: 'receipt_date', header: 'Date', sortValue: (r) => r.receipt_date },
    { key: 'customer', header: 'Customer', render: (r) => r.customer ? `${r.customer.customer_code} — ${r.customer.business_name}` : '—' },
    { key: 'collection_type', header: 'Type', render: (r) => r.collection_type?.label ?? '—' },
    { key: 'van', header: 'Van', render: (r) => r.van ? `${r.van.code} — ${r.van.name}` : '—' },
    { key: 'receipt_amount', header: 'Amount', sortValue: (r) => r.receipt_amount, render: (r) => r.receipt_amount.toFixed(2) },
    { key: 'allocation_status', header: 'Allocation', render: (r) => <span className="capitalize">{r.allocation_status.replace(/_/g, ' ')}</span> },
    {
      key: 'status', header: 'Status',
      render: (r) => <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[r.status]}`}>{r.status.replace(/_/g, ' ')}</span>,
    },
    {
      key: 'actions', header: '', className: 'text-right',
      render: (r) => (
        <div className="flex justify-end gap-2 text-xs">
          {(r.status === 'draft' || r.status === 'pending_submission') && (
            <PermissionGate permission="receipt_vouchers:create">
              <button className="text-green-600 hover:underline" onClick={() => submitReceipt(r.id)}>Submit</button>
            </PermissionGate>
          )}
          {r.status !== 'cancelled_before_posting' && (
            <PermissionGate permission="receipt_vouchers:cancel_draft">
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
            <Receipt size={20} /> Receipt Vouchers
          </h1>
          <p className="text-sm text-slate-500">Draft collections — nothing here has posted or reduced a customer balance yet.</p>
        </div>
        <PermissionGate permission="receipt_vouchers:create">
          <button className="btn-primary" onClick={() => navigate('/collections/receipts/new')}>
            <Plus size={16} /> New Receipt
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
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as ReceiptStatus | '')}>
            <option value="">All</option>
            {(['draft', 'pending_submission', 'submitted', 'returned_for_correction', 'cancelled_before_posting', 'sync_pending', 'sync_failed', 'conflict'] as ReceiptStatus[]).map((s) => (
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
        rows={receipts}
        rowKey={(r) => r.id}
        loading={loading}
        searchPlaceholder="Search receipt #, customer…"
        searchFn={(r, q) => {
          const query = q.toLowerCase();
          return r.receipt_number.toLowerCase().includes(query) || (r.customer?.business_name.toLowerCase().includes(query) ?? false);
        }}
        exportFilename="receipt_vouchers"
      />
    </div>
  );
}
