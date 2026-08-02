import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, ClipboardList, CreditCard, ListChecks, StickyNote, History as HistoryIcon, XCircle, ShieldCheck, Landmark, PauseCircle, PlayCircle, Undo2 } from 'lucide-react';
import { useReceiptVoucherDetail, useReceiptNotes, useReceiptStatusHistory } from '@/hooks/useReceiptVoucherDetail';
import { useReceiptVouchers } from '@/hooks/useReceiptVouchers';
import { useReceiptApprovals, useReceiptHold, useReceiptPosting, useReceiptPostingHistory, useReceiptReversal } from '@/hooks/useReceiptPosting';
import { useReceiptCheques } from '@/hooks/useReceiptCheques';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';

type Tab = 'overview' | 'components' | 'allocations' | 'approvals' | 'cheques' | 'posting' | 'notes' | 'audit';

const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: 'overview', label: 'Overview', icon: ClipboardList },
  { key: 'components', label: 'Payment Components', icon: CreditCard },
  { key: 'allocations', label: 'Invoice Allocations', icon: ListChecks },
  { key: 'approvals', label: 'Approvals', icon: ShieldCheck },
  { key: 'cheques', label: 'Cheques', icon: Landmark },
  { key: 'posting', label: 'Posting', icon: HistoryIcon },
  { key: 'notes', label: 'Notes', icon: StickyNote },
  { key: 'audit', label: 'Audit History', icon: HistoryIcon },
];

export function ReceiptVoucherDetailPage() {
  const { receiptId } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');
  const { receipt, components, allocations, loading, reload } = useReceiptVoucherDetail(receiptId);
  const { notes, addNote } = useReceiptNotes(receiptId);
  const { history } = useReceiptStatusHistory(receiptId);
  const { submitReceipt, cancelReceipt } = useReceiptVouchers();
  const { overallStatus: approvalOverallStatus, steps: approvalSteps, submitForApproval, processAction } = useReceiptApprovals(receiptId);
  const { history: holdHistory, placeOnHold, releaseHold } = useReceiptHold(receiptId);
  const { posting, postReceipt, retryPosting } = useReceiptPosting();
  const { history: postingHistory } = useReceiptPostingHistory(receiptId);
  const { request: reversalRequest, createReversalRequest } = useReceiptReversal(receiptId);
  const { cheques, verify: verifyCheque, clear: clearCheque, returnCheque } = useReceiptCheques(receiptId);
  const { push } = useToast();
  const [newNote, setNewNote] = useState('');

  if (loading || !receipt) return <p className="text-center text-slate-400">Loading…</p>;

  const handleSubmit = async () => {
    const { error } = await submitReceipt(receipt.id);
    if (error) { push('error', error); return; }
    push('success', 'Receipt submitted.');
    reload();
  };

  const handleSubmitForApproval = async () => {
    const { error } = await submitForApproval();
    if (error) { push('error', error); return; }
    push('success', 'Submitted for approval.');
    reload();
  };

  const handlePost = async () => {
    if (!confirm('Post this receipt? This will settle invoices, reduce the customer balance, and cannot be undone through editing.')) return;
    const { data, error } = await postReceipt(receipt.id);
    if (error) { push('error', error); reload(); return; }
    push('success', `Receipt posted — final number ${(data as any)?.final_receipt_number ?? receipt.receipt_number}.`);
    reload();
  };

  const handleRetryPosting = async () => {
    const { error } = await retryPosting(receipt.id);
    if (error) { push('error', error); reload(); return; }
    push('success', 'Posting retried successfully.');
    reload();
  };

  const handlePlaceOnHold = async () => {
    const reason = prompt('Hold reason (duplicate_payment_review/cheque_verification/bank_transfer_verification/card_verification/customer_dispute/allocation_issue/currency_issue/management_review/sync_conflict/other):', 'management_review');
    if (!reason) return;
    const notes = prompt('Hold notes (optional):') ?? undefined;
    const { error } = await placeOnHold(reason, notes);
    if (error) { push('error', error); return; }
    push('success', 'Receipt placed on hold.');
    reload();
  };

  const handleRequestReversal = async () => {
    const reason = prompt('Reason for requesting a reversal of this posted receipt:');
    if (!reason) return;
    const { error } = await createReversalRequest(reason);
    if (error) { push('error', error); return; }
    push('success', 'Reversal request submitted.');
    reload();
  };

  const handleCancel = async () => {
    const reason = prompt('Reason for cancelling this draft:');
    if (!reason) return;
    const { error } = await cancelReceipt(receipt.id, reason);
    if (error) { push('error', error); return; }
    push('success', 'Draft cancelled.');
    reload();
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    const { error } = await addNote(newNote.trim());
    if (error) { push('error', error); return; }
    setNewNote('');
  };

  return (
    <div className="space-y-6">
      <button className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700" onClick={() => navigate('/collections/receipts')}>
        <ArrowLeft size={14} /> Back to Receipt Vouchers
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">{receipt.receipt_number}</h1>
          <p className="text-sm capitalize text-slate-500">
            {receipt.status.replace(/_/g, ' ')} · {receipt.collection_type?.label} · {receipt.customer?.business_name}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {receipt.status === 'draft' && (
            <PermissionGate permission="receipt_vouchers:submit_for_approval">
              <button className="btn-secondary" onClick={handleSubmitForApproval}><Send size={16} /> Submit for Approval</button>
            </PermissionGate>
          )}
          {(receipt.status === 'draft' || receipt.status === 'pending_submission') && (
            <PermissionGate permission="receipt_vouchers:create">
              <button className="btn-secondary" onClick={handleSubmit}><Send size={16} /> Submit</button>
            </PermissionGate>
          )}
          {(receipt.status === 'approved' || receipt.status === 'ready_to_post') && (
            <PermissionGate permission="receipt_vouchers:post_receipt">
              <button className="btn-primary" onClick={handlePost} disabled={posting}>{posting ? 'Posting…' : 'Post Receipt'}</button>
            </PermissionGate>
          )}
          {receipt.status === 'posting_failed' && (
            <PermissionGate permission="receipt_vouchers:retry_posting">
              <button className="btn-primary" onClick={handleRetryPosting} disabled={posting}>{posting ? 'Retrying…' : 'Retry Posting'}</button>
            </PermissionGate>
          )}
          {!receipt.is_on_hold && !['posted', 'partially_allocated', 'fully_allocated', 'unallocated', 'advance', 'cancelled_before_posting', 'reversed'].includes(receipt.status) && (
            <PermissionGate permission="receipt_vouchers:place_on_hold">
              <button className="btn-secondary" onClick={handlePlaceOnHold}><PauseCircle size={16} /> Hold</button>
            </PermissionGate>
          )}
          {receipt.is_on_hold && holdHistory.find((h) => !h.released_by) && (
            <PermissionGate permission="receipt_vouchers:release_hold">
              <button className="btn-primary" onClick={() => releaseHold(holdHistory.find((h) => !h.released_by)!.id)}><PlayCircle size={16} /> Release Hold</button>
            </PermissionGate>
          )}
          {['posted', 'partially_allocated', 'fully_allocated', 'unallocated', 'advance'].includes(receipt.status) && !reversalRequest && (
            <PermissionGate permission="receipt_vouchers:request_reversal">
              <button className="btn-secondary text-red-600" onClick={handleRequestReversal}><Undo2 size={16} /> Request Reversal</button>
            </PermissionGate>
          )}
          {receipt.status !== 'cancelled_before_posting' && !['posted', 'partially_allocated', 'fully_allocated', 'unallocated', 'advance', 'reversed'].includes(receipt.status) && (
            <PermissionGate permission="receipt_vouchers:cancel_draft">
              <button className="btn-secondary text-red-600" onClick={handleCancel}><XCircle size={16} /> Cancel Draft</button>
            </PermissionGate>
          )}
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-700">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500'}`}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="card grid grid-cols-1 gap-4 p-4 sm:grid-cols-3">
          <div><p className="label">Receipt Date</p><p>{receipt.receipt_date}</p></div>
          <div><p className="label">Receipt Amount</p><p className="font-medium">{receipt.receipt_amount.toFixed(2)}</p></div>
          <div><p className="label">Allocated</p><p>{receipt.allocated_amount.toFixed(2)}</p></div>
          <div><p className="label">Unallocated</p><p>{receipt.unallocated_amount.toFixed(2)}</p></div>
          <div><p className="label">Advance</p><p>{receipt.advance_amount.toFixed(2)}</p></div>
          <div><p className="label">Allocation Status</p><p className="capitalize">{receipt.allocation_status.replace(/_/g, ' ')}</p></div>
          <div><p className="label">Route</p><p>{receipt.route?.name ?? '—'}</p></div>
          <div><p className="label">Van</p><p>{receipt.van ? `${receipt.van.code} — ${receipt.van.name}` : '—'}</p></div>
          <div><p className="label">Responsible Employee</p><p>{receipt.responsible_employee?.full_name ?? '—'}</p></div>
          <div><p className="label">Reference Number</p><p>{receipt.reference_number ?? '—'}</p></div>
          <div><p className="label">Source</p><p className="capitalize">{receipt.collection_source}</p></div>
          <div><p className="label">Remarks</p><p>{receipt.remarks ?? '—'}</p></div>
        </div>
      )}

      {tab === 'components' && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-700">
                <th className="p-3">Method</th><th className="p-3">Amount</th><th className="p-3">Reference</th>
                <th className="p-3">Bank/Terminal</th><th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {components.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="p-3 capitalize">{c.payment_method_code.replace(/_/g, ' ')}</td>
                  <td className="p-3">{c.amount.toFixed(2)}</td>
                  <td className="p-3">{c.reference ?? '—'}</td>
                  <td className="p-3">{c.bank_or_terminal ?? '—'}</td>
                  <td className="p-3 capitalize">{c.status.replace(/_/g, ' ')}</td>
                </tr>
              ))}
              {components.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-slate-400">No payment components.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'allocations' && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-700">
                <th className="p-3">Invoice</th><th className="p-3">Outstanding at Allocation</th><th className="p-3">Allocated</th><th className="p-3">Method</th>
              </tr>
            </thead>
            <tbody>
              {allocations.map((a) => (
                <tr key={a.id} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="p-3">
                    <button className="text-blue-600 hover:underline dark:text-blue-400" onClick={() => navigate(`/sales/invoices/${a.invoice_id}`)}>
                      {a.invoice?.final_invoice_number ?? a.invoice?.invoice_number ?? a.invoice_id}
                    </button>
                  </td>
                  <td className="p-3">{a.invoice_outstanding_snapshot.toFixed(2)}</td>
                  <td className="p-3">{a.allocated_amount.toFixed(2)}</td>
                  <td className="p-3 capitalize">{a.allocation_method.replace(/_/g, ' ')}</td>
                </tr>
              ))}
              {allocations.length === 0 && <tr><td colSpan={4} className="p-4 text-center text-slate-400">No invoice allocations — this receipt is advance or unallocated.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'approvals' && (
        <div className="space-y-4">
          <h3 className="font-semibold">Approval Status: <span className="capitalize">{(approvalOverallStatus ?? 'not required').replace(/_/g, ' ')}</span></h3>
          <div className="space-y-2">
            {approvalSteps.map((s) => (
              <div key={s.id} className="card p-3 text-sm">
                <div className="flex items-center justify-between">
                  <p className="font-medium capitalize">{s.sequence}. {s.approval_type.replace(/_/g, ' ')} <span className="text-xs text-slate-500">({s.required_role})</span></p>
                  <span className="capitalize">{s.status.replace(/_/g, ' ')}</span>
                </div>
                {s.status === 'pending' && (
                  <div className="mt-2 flex gap-2">
                    <PermissionGate permission="receipt_vouchers:approve_receipt">
                      <button className="btn-secondary !py-1 text-xs text-green-600" onClick={() => processAction(s.id, 'approve')}>Approve</button>
                    </PermissionGate>
                    <PermissionGate permission="receipt_vouchers:reject_receipt">
                      <button className="btn-secondary !py-1 text-xs text-red-600" onClick={() => {
                        const reason = prompt('Reason for rejection:');
                        if (reason) processAction(s.id, 'reject', reason);
                      }}>Reject</button>
                    </PermissionGate>
                    <PermissionGate permission="receipt_vouchers:return_for_correction">
                      <button className="btn-secondary !py-1 text-xs" onClick={() => {
                        const reason = prompt('Reason for returning for correction:');
                        if (reason) processAction(s.id, 'return_for_correction', reason);
                      }}>Return for Correction</button>
                    </PermissionGate>
                  </div>
                )}
                {s.reason && <p className="mt-1 text-xs text-slate-500">Reason: {s.reason}</p>}
              </div>
            ))}
            {approvalSteps.length === 0 && <p className="text-sm text-slate-500">No approval steps yet — submit for approval to evaluate triggers.</p>}
          </div>
        </div>
      )}

      {tab === 'cheques' && (
        <div className="space-y-2">
          {cheques.map((c) => (
            <div key={c.payment_component_id} className="card p-3 text-sm">
              <div className="flex items-center justify-between">
                <p className="font-medium">{c.cheque_number} — {c.bank_name}</p>
                <span className="capitalize">{c.cheque_status.replace(/_/g, ' ')}</span>
              </div>
              <p className="text-xs text-slate-500">Amount {c.amount.toFixed(2)} · Cheque Date {c.cheque_date} {c.is_post_dated && '· Post-Dated'}</p>
              {c.verification_notes && <p className="mt-1 text-xs text-slate-500">Notes: {c.verification_notes}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                {c.cheque_status === 'pending_verification' && (
                  <PermissionGate permission="receipt_vouchers:verify_cheque">
                    <button className="btn-secondary !py-1 text-xs text-green-600" onClick={() => verifyCheque(c.payment_component_id, true)}>Verify</button>
                    <button className="btn-secondary !py-1 text-xs text-red-600" onClick={() => {
                      const notes = prompt('Reason for rejecting verification:');
                      if (notes) verifyCheque(c.payment_component_id, false, notes);
                    }}>Reject</button>
                  </PermissionGate>
                )}
                {['verified', 'deposited'].includes(c.cheque_status) && (
                  <PermissionGate permission="receipt_vouchers:mark_cheque_cleared">
                    <button className="btn-secondary !py-1 text-xs" onClick={() => {
                      const ref = prompt('Bank reference (optional):') ?? undefined;
                      clearCheque(c.payment_component_id, ref);
                    }}>Mark Cleared</button>
                  </PermissionGate>
                )}
                {!['returned', 'cleared', 'cancelled', 'replaced'].includes(c.cheque_status) && (
                  <PermissionGate permission="receipt_vouchers:mark_cheque_returned">
                    <button className="btn-secondary !py-1 text-xs text-red-600" onClick={() => {
                      const reason = prompt('Return reason (insufficient_funds/signature_mismatch/account_closed/payment_stopped/date_error/amount_mismatch/technical_return/other):', 'insufficient_funds');
                      if (reason) returnCheque(c.payment_component_id, reason);
                    }}>Mark Returned</button>
                  </PermissionGate>
                )}
              </div>
            </div>
          ))}
          {cheques.length === 0 && <p className="text-sm text-slate-500">No cheque payment components on this receipt.</p>}
        </div>
      )}

      {tab === 'posting' && (
        <div className="space-y-2">
          {postingHistory.map((h) => (
            <div key={h.id} className="card p-3 text-sm">
              <div className="flex items-center justify-between">
                <p className="font-medium">Attempt {h.attempt_number} — <span className={h.status === 'succeeded' ? 'text-green-600' : 'text-red-600'}>{h.status}</span></p>
                <span className="text-xs text-slate-400">{h.online ? 'Online' : 'Offline'}</span>
              </div>
              {h.final_receipt_number && <p className="text-slate-500">Final number: {h.final_receipt_number}</p>}
              {h.error_message && <p className="text-red-600">{h.error_message}</p>}
              <p className="text-xs text-slate-400">{new Date(h.attempted_at).toLocaleString()}</p>
            </div>
          ))}
          {postingHistory.length === 0 && <p className="text-sm text-slate-500">No posting attempts yet.</p>}
        </div>
      )}

      {tab === 'notes' && (
        <div className="space-y-4">
          <div className="card flex gap-2 p-4">
            <input className="input flex-1" placeholder="Add a note…" value={newNote} onChange={(e) => setNewNote(e.target.value)} />
            <button className="btn-primary" onClick={handleAddNote}>Add</button>
          </div>
          <div className="space-y-2">
            {notes.map((n) => (
              <div key={n.id} className="card p-3 text-sm">
                <p>{n.note}</p>
                <p className="mt-1 text-xs capitalize text-slate-400">{n.note_type} · {new Date(n.created_at).toLocaleString()}</p>
              </div>
            ))}
            {notes.length === 0 && <p className="text-sm text-slate-500">No notes yet.</p>}
          </div>
          {(receipt.remarks || receipt.internal_notes) && (
            <div className="card p-4 text-sm">
              {receipt.remarks && <p><span className="font-medium">Remarks:</span> {receipt.remarks}</p>}
              {receipt.internal_notes && <p className="mt-1"><span className="font-medium">Internal notes:</span> {receipt.internal_notes}</p>}
            </div>
          )}
        </div>
      )}

      {tab === 'audit' && (
        <div className="space-y-2">
          {history.map((h) => (
            <div key={h.id} className="card p-3 text-sm">
              <p><span className="capitalize">{h.old_status ?? 'created'}</span> → <span className="font-medium capitalize">{h.new_status}</span></p>
              {h.reason && <p className="text-slate-500">Reason: {h.reason}</p>}
              <p className="text-xs text-slate-400">{new Date(h.changed_at).toLocaleString()}</p>
            </div>
          ))}
          {history.length === 0 && <p className="text-sm text-slate-500">No status changes yet.</p>}
        </div>
      )}
    </div>
  );
}
