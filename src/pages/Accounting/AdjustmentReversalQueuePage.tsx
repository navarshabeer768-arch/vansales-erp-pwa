import { useNavigate } from 'react-router-dom';
import { Undo2, Check, X } from 'lucide-react';
import { useAdjustmentReversalQueue, ADJUSTMENT_DOCUMENT_LABELS, ADJUSTMENT_DOCUMENT_ROUTES } from '@/hooks/useAdjustmentReversalAndAllocation';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';

export function AdjustmentReversalQueuePage() {
  const { requests, loading, decide } = useAdjustmentReversalQueue();
  const { push } = useToast();
  const navigate = useNavigate();

  const handleApprove = async (id: string) => {
    if (!confirm('Approve this reversal? The customer ledger and any invoice credit will be reversed. This cannot be undone.')) return;
    const { error } = await decide(id, true);
    if (error) { push('error', error); return; }
    push('success', 'Reversal approved.');
  };

  const handleReject = async (id: string) => {
    const reason = prompt('Reason for rejecting this reversal request:');
    if (!reason) return;
    const { error } = await decide(id, false, reason);
    if (error) { push('error', error); return; }
    push('success', 'Reversal request rejected.');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-slate-100">
          <Undo2 size={20} /> Adjustment Reversal Requests
        </h1>
        <p className="text-sm text-slate-500">
          Requests to reverse a posted credit note, debit note, or customer adjustment. Approving restores the
          customer's balance and any invoice credit to their pre-posting state.
        </p>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-700">
              <th className="p-3">Document</th><th className="p-3">Reason</th><th className="p-3">Requested</th><th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={4} className="p-4 text-center text-slate-400">Loading…</td></tr>}
            {!loading && requests.length === 0 && <tr><td colSpan={4} className="p-4 text-center text-slate-400">No pending reversal requests.</td></tr>}
            {requests.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800">
                <td className="p-3">
                  <button className="font-medium text-blue-600 hover:underline dark:text-blue-400" onClick={() => navigate(`${ADJUSTMENT_DOCUMENT_ROUTES[r.document_table]}/${r.document_id}`)}>
                    {ADJUSTMENT_DOCUMENT_LABELS[r.document_table]}
                  </button>
                </td>
                <td className="p-3">{r.reason}</td>
                <td className="p-3">{new Date(r.request_date).toLocaleString()}</td>
                <td className="p-3 text-right">
                  <div className="flex justify-end gap-2">
                    <PermissionGate permission="financial_adjustments:reverse_documents">
                      <button className="btn-secondary !py-1 text-xs text-green-600" onClick={() => handleApprove(r.id)}><Check size={12} /> Approve</button>
                    </PermissionGate>
                    <PermissionGate permission="financial_adjustments:reverse_documents">
                      <button className="btn-secondary !py-1 text-xs text-red-600" onClick={() => handleReject(r.id)}><X size={12} /> Reject</button>
                    </PermissionGate>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
