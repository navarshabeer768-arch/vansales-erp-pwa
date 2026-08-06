import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, ClipboardList, Package, User, FileText, Link2, StickyNote, History as HistoryIcon, XCircle, ShieldCheck, Landmark, Undo2, Printer } from 'lucide-react';
import { useCreditNoteDetail, useAdjustmentNotes, useAdjustmentStatusHistory } from '@/hooks/useCreditNotes';
import { useCreditNotes } from '@/hooks/useCreditNotes';
import { useAdjustmentApprovals, useAdjustmentPosting, useAdjustmentPostingHistory, useAdjustmentReversal } from '@/hooks/useAdjustmentApprovalPosting';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';

type Tab = 'overview' | 'items' | 'customer' | 'invoice' | 'approval' | 'posting' | 'reversal' | 'references' | 'notes' | 'sync' | 'audit';

const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: 'overview', label: 'Overview', icon: ClipboardList },
  { key: 'items', label: 'Items', icon: Package },
  { key: 'customer', label: 'Customer', icon: User },
  { key: 'invoice', label: 'Invoice', icon: FileText },
  { key: 'approval', label: 'Approval', icon: ShieldCheck },
  { key: 'posting', label: 'Posting History', icon: Landmark },
  { key: 'reversal', label: 'Reversal', icon: Undo2 },
  { key: 'references', label: 'References', icon: Link2 },
  { key: 'notes', label: 'Notes', icon: StickyNote },
  { key: 'sync', label: 'Sync History', icon: HistoryIcon },
  { key: 'audit', label: 'Audit History', icon: HistoryIcon },
];

export function CreditNoteDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');
  const { doc, items, loading, reload } = useCreditNoteDetail(id);
  const { notes, addNote } = useAdjustmentNotes('credit_notes', id);
  const { history } = useAdjustmentStatusHistory('credit_notes', id);
  const { submitDraft, cancelDraft } = useCreditNotes();
  const { overallStatus: approvalOverallStatus, steps: approvalSteps, submitForApproval, processAction } = useAdjustmentApprovals('credit_notes', id);
  const { posting, post, retry } = useAdjustmentPosting('credit_notes');
  const { history: postingHistory } = useAdjustmentPostingHistory('credit_notes', id);
  const { request: reversalRequest, createReversalRequest } = useAdjustmentReversal('credit_notes', id);
  const { push } = useToast();
  const [newNote, setNewNote] = useState('');

  if (loading || !doc) return <p className="text-center text-slate-400">Loading…</p>;

  const handleSubmit = async () => {
    const { error } = await submitDraft(doc.id);
    if (error) { push('error', error); return; }
    push('success', 'Credit note submitted.');
    reload();
  };

  const handleSubmitForApproval = async () => {
    const { error } = await submitForApproval();
    if (error) { push('error', error); return; }
    push('success', 'Submitted for approval.');
    reload();
  };

  const handlePost = async () => {
    if (!confirm('Post this credit note? This will adjust the customer ledger and cannot be undone through editing.')) return;
    const { data, error } = await post(doc.id);
    if (error) { push('error', error); reload(); return; }
    push('success', `Credit note posted — ${(data as any)?.invoice_credited ?? 0} credited to invoice, ${(data as any)?.unallocated ?? 0} unallocated.`);
    reload();
  };

  const handleRetryPosting = async () => {
    const { error } = await retry(doc.id);
    if (error) { push('error', error); reload(); return; }
    push('success', 'Posting retried successfully.');
    reload();
  };

  const handleRequestReversal = async () => {
    const reason = prompt('Reason for requesting a reversal of this posted credit note:');
    if (!reason) return;
    const { error } = await createReversalRequest(reason);
    if (error) { push('error', error); return; }
    push('success', 'Reversal request submitted.');
    reload();
  };

  const handleCancel = async () => {
    const reason = prompt('Reason for cancelling this draft:');
    if (!reason) return;
    const { error } = await cancelDraft(doc.id, reason);
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
      <button className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700" onClick={() => navigate('/accounting/credit-notes')}>
        <ArrowLeft size={14} /> Back to Credit Notes
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">{doc.document_number}</h1>
          <p className="text-sm capitalize text-slate-500">{doc.status.replace(/_/g, ' ')} · {doc.document_type?.label} · {doc.customer?.business_name}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {doc.status === 'draft' && (
            <PermissionGate permission="financial_adjustments:create_credit_note">
              <button className="btn-secondary" onClick={handleSubmitForApproval}><Send size={16} /> Submit for Approval</button>
            </PermissionGate>
          )}
          {doc.status === 'draft' && (
            <PermissionGate permission="financial_adjustments:create_credit_note">
              <button className="btn-secondary" onClick={handleSubmit}><Send size={16} /> Submit</button>
            </PermissionGate>
          )}
          {doc.status === 'ready_to_post' && (
            <PermissionGate permission="financial_adjustments:post_credit_note">
              <button className="btn-primary" onClick={handlePost} disabled={posting}>{posting ? 'Posting…' : 'Post'}</button>
            </PermissionGate>
          )}
          {doc.status === 'posting_failed' && (
            <PermissionGate permission="financial_adjustments:post_credit_note">
              <button className="btn-primary" onClick={handleRetryPosting} disabled={posting}>{posting ? 'Retrying…' : 'Retry Posting'}</button>
            </PermissionGate>
          )}
          {doc.status === 'posted' && !reversalRequest && (
            <PermissionGate permission="financial_adjustments:reverse_documents">
              <button className="btn-secondary text-red-600" onClick={handleRequestReversal}><Undo2 size={16} /> Request Reversal</button>
            </PermissionGate>
          )}
          {!['posted', 'reversal_requested', 'reversed', 'cancelled'].includes(doc.status) && (
            <PermissionGate permission="financial_adjustments:cancel_draft">
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
          <div><p className="label">Document Date</p><p>{doc.document_date}</p></div>
          <div><p className="label">Net Amount</p><p className="font-medium">{doc.net_amount.toFixed(2)}</p></div>
          <div><p className="label">Adjustment Type</p><p className="capitalize">{doc.adjustment_type.replace(/_/g, ' ')}</p></div>
          <div><p className="label">Reason</p><p>{doc.reason?.label ?? '—'}</p></div>
          <div><p className="label">Gross Amount</p><p>{doc.gross_amount.toFixed(2)}</p></div>
          <div><p className="label">Currency</p><p>{doc.currency}</p></div>
        </div>
      )}

      {tab === 'items' && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-700">
                <th className="p-3">Product</th><th className="p-3">Original</th><th className="p-3">Corrected</th><th className="p-3">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="p-3">{i.product?.name ?? i.description ?? '—'}</td>
                  <td className="p-3 text-xs text-slate-500">
                    {i.original_price != null && `Price ${i.original_price.toFixed(2)}`}
                    {i.original_quantity != null && `Qty ${i.original_quantity}`}
                    {i.original_discount != null && `Discount ${i.original_discount.toFixed(2)}`}
                    {i.original_tax != null && `Tax ${i.original_tax.toFixed(2)}`}
                  </td>
                  <td className="p-3 text-xs text-slate-500">
                    {i.corrected_price != null && `Price ${i.corrected_price.toFixed(2)}`}
                    {i.corrected_quantity != null && `Qty ${i.corrected_quantity}`}
                    {i.corrected_discount != null && `Discount ${i.corrected_discount.toFixed(2)}`}
                    {i.corrected_tax != null && `Tax ${i.corrected_tax.toFixed(2)}`}
                  </td>
                  <td className="p-3 font-medium">{i.adjustment_amount.toFixed(2)}</td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={4} className="p-4 text-center text-slate-400">Amount-only credit note — no line items.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'customer' && (
        <div className="card p-4 text-sm">
          <p className="font-medium">{doc.customer?.customer_code} — {doc.customer?.business_name}</p>
        </div>
      )}

      {tab === 'invoice' && (
        <div className="card p-4 text-sm">
          {doc.original_invoice ? <p>{doc.original_invoice.final_invoice_number ?? doc.original_invoice.invoice_number}</p> : <p className="text-slate-500">No invoice referenced.</p>}
        </div>
      )}

      {tab === 'approval' && (
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
                    <PermissionGate permission="financial_adjustments:approve_credit_note">
                      <button className="btn-secondary !py-1 text-xs text-green-600" onClick={() => processAction(s.id, 'approve')}>Approve</button>
                    </PermissionGate>
                    <PermissionGate permission="financial_adjustments:approve_credit_note">
                      <button className="btn-secondary !py-1 text-xs text-red-600" onClick={() => {
                        const reason = prompt('Reason for rejection:');
                        if (reason) processAction(s.id, 'reject', reason);
                      }}>Reject</button>
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

      {tab === 'posting' && (
        <div className="space-y-2">
          {postingHistory.map((h) => (
            <div key={h.id} className="card p-3 text-sm">
              <div className="flex items-center justify-between">
                <p className="font-medium">Attempt {h.attempt_number} — <span className={h.status === 'succeeded' ? 'text-green-600' : 'text-red-600'}>{h.status}</span></p>
                <span className="text-xs text-slate-400">{h.online ? 'Online' : 'Offline'}</span>
              </div>
              {h.final_document_number && <p className="text-slate-500">Final number: {h.final_document_number}</p>}
              {h.status === 'succeeded' && <p className="text-xs text-slate-500">Invoice credited {h.invoice_credited_amount.toFixed(2)} · Unallocated {h.unallocated_amount.toFixed(2)}</p>}
              {h.error_message && <p className="text-red-600">{h.error_message}</p>}
              <p className="text-xs text-slate-400">{new Date(h.attempted_at).toLocaleString()}</p>
            </div>
          ))}
          {postingHistory.length === 0 && <p className="text-sm text-slate-500">No posting attempts yet.</p>}
        </div>
      )}

      {tab === 'reversal' && (
        <div className="card p-4 text-sm">
          {reversalRequest ? (
            <div>
              <p className="capitalize">Status: {reversalRequest.approval_status}</p>
              <p className="mt-1 text-slate-500">Reason: {reversalRequest.reason}</p>
              {reversalRequest.decision_reason && <p className="mt-1 text-slate-500">Decision: {reversalRequest.decision_reason}</p>}
              {reversalRequest.approval_status === 'approved' && (
                <p className="mt-2 text-xs text-slate-500">Reversed {reversalRequest.reversed_credited_amount.toFixed(2)} invoice credit, {reversalRequest.reversed_unallocated_amount.toFixed(2)} unallocated.</p>
              )}
            </div>
          ) : <p className="text-slate-500">No reversal has been requested for this credit note.</p>}
        </div>
      )}

      {tab === 'references' && (
        <div className="card p-4 text-sm">
          <p><span className="label">Reference Number:</span> {doc.reference_number ?? '—'}</p>
          {doc.original_return_id && <p className="mt-2"><span className="label">Original Return:</span> {doc.original_return_id}</p>}
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
        </div>
      )}

      {tab === 'sync' && (
        <div className="card p-4 text-sm text-slate-500">
          {doc.status.startsWith('sync') || doc.status === 'conflict' ? `Sync status: ${doc.status.replace(/_/g, ' ')}` : 'This document was created online.'}
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
