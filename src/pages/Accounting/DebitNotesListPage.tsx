import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FilePlus } from 'lucide-react';
import { useDebitNotes } from '@/hooks/useDebitNotes';
import type { DebitNoteRow } from '@/hooks/useDebitNotes';
import { ADJUSTMENT_STATUS_STYLES as STATUS_STYLES } from '@/hooks/useCreditNotes';
import type { AdjustmentStatus } from '@/hooks/useCreditNotes';
import { DataTable, Column } from '@/components/ui/DataTable';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';
export function DebitNotesListPage() {
  const navigate = useNavigate();
  const [dateFrom, setDateFrom] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<AdjustmentStatus | ''>('');
  const { push } = useToast();
  const { notes, loading, submitDraft, cancelDraft } = useDebitNotes({ dateFrom, dateTo, status: status || undefined });

  const handleCancel = async (id: string) => {
    const reason = prompt('Reason for cancelling this draft:');
    if (!reason) return;
    const { error } = await cancelDraft(id, reason);
    if (error) push('error', error); else push('success', 'Draft cancelled.');
  };

  const columns: Column<DebitNoteRow>[] = [
    {
      key: 'document_number', header: 'Number', sortValue: (r) => r.document_number,
      render: (r) => (
        <button className="font-medium text-blue-600 hover:underline dark:text-blue-400" onClick={() => navigate(`/accounting/debit-notes/${r.id}`)}>
          {r.document_number}
        </button>
      ),
    },
    { key: 'document_date', header: 'Date', sortValue: (r) => r.document_date },
    { key: 'customer', header: 'Customer', render: (r) => r.customer ? `${r.customer.customer_code} — ${r.customer.business_name}` : '—' },
    { key: 'document_type', header: 'Type', render: (r) => r.document_type?.label ?? '—' },
    { key: 'net_amount', header: 'Net Amount', sortValue: (r) => r.net_amount, render: (r) => r.net_amount.toFixed(2) },
    {
      key: 'status', header: 'Status',
      render: (r) => <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[r.status]}`}>{r.status.replace(/_/g, ' ')}</span>,
    },
    {
      key: 'actions', header: '', className: 'text-right',
      render: (r) => (
        <div className="flex justify-end gap-2 text-xs">
          {r.status === 'draft' && (
            <PermissionGate permission="financial_adjustments:create_debit_note">
              <button className="text-green-600 hover:underline" onClick={() => submitDraft(r.id)}>Submit</button>
            </PermissionGate>
          )}
          {r.status !== 'cancelled' && (
            <PermissionGate permission="financial_adjustments:cancel_draft">
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
            <FilePlus size={20} /> Debit Notes
          </h1>
          <p className="text-sm text-slate-500">Draft debit notes — nothing here has posted or adjusted a customer balance yet.</p>
        </div>
        <PermissionGate permission="financial_adjustments:create_debit_note">
          <button className="btn-primary" onClick={() => navigate('/accounting/debit-notes/new')}>
            <Plus size={16} /> New Debit Note
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
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as AdjustmentStatus | '')}>
            <option value="">All</option>
            {(['draft', 'pending_approval', 'approved', 'ready_to_post', 'posted', 'on_hold', 'reversal_requested', 'reversed', 'submitted', 'returned', 'cancelled', 'sync_pending', 'sync_failed', 'conflict'] as AdjustmentStatus[]).map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={notes}
        rowKey={(r) => r.id}
        loading={loading}
        searchPlaceholder="Search number, customer…"
        searchFn={(r, q) => {
          const query = q.toLowerCase();
          return r.document_number.toLowerCase().includes(query) || (r.customer?.business_name.toLowerCase().includes(query) ?? false);
        }}
        exportFilename="debit_notes"
      />
    </div>
  );
}
