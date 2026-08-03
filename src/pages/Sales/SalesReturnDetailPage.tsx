import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, ClipboardList, Package, Layers, Barcode, Calculator, StickyNote, History as HistoryIcon, XCircle, ShieldCheck, ClipboardCheck, Warehouse, Receipt, PauseCircle, PlayCircle, Undo2 } from 'lucide-react';
import { useSalesReturnDetail, useSalesReturnNotes, useSalesReturnStatusHistory } from '@/hooks/useSalesReturnDetail';
import { useSalesReturns } from '@/hooks/useSalesReturns';
import { useReturnApprovals, useReturnHold, useReturnInspection, useReturnPosting, useReturnPostingHistory } from '@/hooks/useReturnPosting';
import { useReturnCreditNote, useReturnReversal } from '@/hooks/useReturnCreditNoteAndReversal';
import { useReturnCatalogs } from '@/hooks/useReturnCatalogs';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';

type Tab = 'overview' | 'items' | 'batches' | 'serials' | 'pricing' | 'approvals' | 'inspection' | 'stock_posting' | 'credit_note' | 'posting' | 'notes' | 'audit';

const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: 'overview', label: 'Overview', icon: ClipboardList },
  { key: 'items', label: 'Return Items', icon: Package },
  { key: 'batches', label: 'Batches', icon: Layers },
  { key: 'serials', label: 'Serials', icon: Barcode },
  { key: 'pricing', label: 'Pricing Preview', icon: Calculator },
  { key: 'approvals', label: 'Approvals', icon: ShieldCheck },
  { key: 'inspection', label: 'Inspection', icon: ClipboardCheck },
  { key: 'stock_posting', label: 'Stock Posting', icon: Warehouse },
  { key: 'credit_note', label: 'Credit Note', icon: Receipt },
  { key: 'posting', label: 'Posting History', icon: HistoryIcon },
  { key: 'notes', label: 'Notes', icon: StickyNote },
  { key: 'audit', label: 'Audit History', icon: HistoryIcon },
];

export function SalesReturnDetailPage() {
  const { returnId } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');
  const { salesReturn, items, loading, reload } = useSalesReturnDetail(returnId);
  const { notes, addNote } = useSalesReturnNotes(returnId);
  const { history } = useSalesReturnStatusHistory(returnId);
  const { submitReturn, cancelReturn } = useSalesReturns();
  const { overallStatus: approvalOverallStatus, steps: approvalSteps, submitForApproval, processAction } = useReturnApprovals(returnId);
  const { history: holdHistory, placeOnHold, releaseHold } = useReturnHold(returnId);
  const { inspectionId, inspectionStatus, items: inspectionItems, startInspection, recordResult, completeInspection } = useReturnInspection(returnId);
  const { posting, postReturn, retryPosting } = useReturnPosting();
  const { history: postingHistory } = useReturnPostingHistory(returnId);
  const { creditNote, generate: generateCreditNote } = useReturnCreditNote(returnId);
  const { request: reversalRequest, createReversalRequest } = useReturnReversal(returnId);
  const { returnConditions } = useReturnCatalogs();
  const { push } = useToast();
  const [newNote, setNewNote] = useState('');

  if (loading || !salesReturn) return <p className="text-center text-slate-400">Loading…</p>;

  const handleSubmit = async () => {
    const { error } = await submitReturn(salesReturn.id);
    if (error) { push('error', error); return; }
    push('success', 'Return submitted.');
    reload();
  };

  const handleSubmitForApproval = async () => {
    const { error } = await submitForApproval();
    if (error) { push('error', error); return; }
    push('success', 'Submitted for approval.');
    reload();
  };

  const handleStartInspection = async () => {
    const { error } = await startInspection();
    if (error) { push('error', error); return; }
    push('success', 'Inspection started.');
    reload();
  };

  const handleCompleteInspection = async () => {
    const { error } = await completeInspection();
    if (error) { push('error', error); return; }
    push('success', 'Inspection completed.');
    reload();
  };

  const handlePost = async () => {
    if (!confirm('Post this return? This will move accepted stock into inventory, generate any eligible customer credit, and cannot be undone through editing.')) return;
    const { data, error } = await postReturn(salesReturn.id);
    if (error) { push('error', error); reload(); return; }
    push('success', `Return posted — final number ${(data as any)?.final_return_number ?? salesReturn.return_number}.`);
    reload();
  };

  const handleRetryPosting = async () => {
    const { error } = await retryPosting(salesReturn.id);
    if (error) { push('error', error); reload(); return; }
    push('success', 'Posting retried successfully.');
    reload();
  };

  const handlePlaceOnHold = async () => {
    const reason = prompt('Hold reason (inspection_pending/invoice_verification/batch_verification/serial_verification/credit_review/replacement_review/customer_dispute/management_review/offline_conflict/other):', 'management_review');
    if (!reason) return;
    const notes = prompt('Hold notes (optional):') ?? undefined;
    const { error } = await placeOnHold(reason, notes);
    if (error) { push('error', error); return; }
    push('success', 'Return placed on hold.');
    reload();
  };

  const handleGenerateCreditNote = async () => {
    const reason = prompt('Reason for the credit note (optional):') ?? undefined;
    const { error } = await generateCreditNote(reason);
    if (error) { push('error', error); return; }
    push('success', 'Credit note generated.');
    reload();
  };

  const handleRequestReversal = async () => {
    const reason = prompt('Reason for requesting a reversal of this posted return:');
    if (!reason) return;
    const { error } = await createReversalRequest(reason);
    if (error) { push('error', error); return; }
    push('success', 'Reversal request submitted.');
    reload();
  };

  const handleCancel = async () => {
    const reason = prompt('Reason for cancelling this draft:');
    if (!reason) return;
    const { error } = await cancelReturn(salesReturn.id, reason);
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
      <button className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700" onClick={() => navigate('/sales/returns')}>
        <ArrowLeft size={14} /> Back to Sales Returns
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">{salesReturn.return_number}</h1>
          <p className="text-sm capitalize text-slate-500">
            {salesReturn.status.replace(/_/g, ' ')} · {salesReturn.return_type?.label} · {salesReturn.customer?.business_name}
            {salesReturn.original_invoice && ` · Invoice ${salesReturn.original_invoice.final_invoice_number ?? salesReturn.original_invoice.invoice_number}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {salesReturn.status === 'draft' && (
            <PermissionGate permission="sales_returns:submit_for_approval">
              <button className="btn-secondary" onClick={handleSubmitForApproval}><Send size={16} /> Submit for Approval</button>
            </PermissionGate>
          )}
          {(salesReturn.status === 'draft' || salesReturn.status === 'pending_submission') && (
            <PermissionGate permission="sales_returns:create">
              <button className="btn-secondary" onClick={handleSubmit}><Send size={16} /> Submit</button>
            </PermissionGate>
          )}
          {(salesReturn.status === 'approved' || salesReturn.status === 'partially_approved') && !inspectionId && (
            <PermissionGate permission="sales_returns:inspect_return">
              <button className="btn-secondary" onClick={handleStartInspection}><ClipboardCheck size={16} /> Start Inspection</button>
            </PermissionGate>
          )}
          {inspectionStatus === 'in_progress' && (
            <PermissionGate permission="sales_returns:inspect_return">
              <button className="btn-secondary" onClick={handleCompleteInspection}><ClipboardCheck size={16} /> Complete Inspection</button>
            </PermissionGate>
          )}
          {(salesReturn.status === 'accepted' || salesReturn.status === 'partially_accepted' || salesReturn.status === 'ready_to_post') && (
            <PermissionGate permission="sales_returns:post_return">
              <button className="btn-primary" onClick={handlePost} disabled={posting}>{posting ? 'Posting…' : 'Post Return'}</button>
            </PermissionGate>
          )}
          {salesReturn.status === 'posting_failed' && (
            <PermissionGate permission="sales_returns:retry_posting">
              <button className="btn-primary" onClick={handleRetryPosting} disabled={posting}>{posting ? 'Retrying…' : 'Retry Posting'}</button>
            </PermissionGate>
          )}
          {['posted', 'replacement_pending', 'replacement_approved', 'replacement_completed', 'credit_note_pending'].includes(salesReturn.status) && !creditNote && (
            <PermissionGate permission="sales_returns:generate_credit_note">
              <button className="btn-secondary" onClick={handleGenerateCreditNote}><Receipt size={16} /> Generate Credit Note</button>
            </PermissionGate>
          )}
          {!salesReturn.is_on_hold && !['posted', 'partially_accepted', 'accepted', 'rejected', 'cancelled_before_posting', 'reversed'].includes(salesReturn.status) && (
            <PermissionGate permission="sales_returns:place_on_hold">
              <button className="btn-secondary" onClick={handlePlaceOnHold}><PauseCircle size={16} /> Hold</button>
            </PermissionGate>
          )}
          {salesReturn.is_on_hold && holdHistory.find((h) => !h.released_by) && (
            <PermissionGate permission="sales_returns:release_hold">
              <button className="btn-primary" onClick={() => releaseHold(holdHistory.find((h) => !h.released_by)!.id)}><PlayCircle size={16} /> Release Hold</button>
            </PermissionGate>
          )}
          {['posted', 'partially_accepted', 'credit_note_generated', 'replacement_pending', 'replacement_completed'].includes(salesReturn.status) && !reversalRequest && (
            <PermissionGate permission="sales_returns:request_reversal">
              <button className="btn-secondary text-red-600" onClick={handleRequestReversal}><Undo2 size={16} /> Request Reversal</button>
            </PermissionGate>
          )}
          {['draft', 'pending_validation', 'pending_submission', 'pending_approval', 'partially_approved', 'approved', 'returned_for_correction', 'on_hold'].includes(salesReturn.status) && (
            <PermissionGate permission="sales_returns:cancel_return_draft">
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
          <div><p className="label">Return Date</p><p>{salesReturn.return_date}</p></div>
          <div><p className="label">Net Return Amount</p><p className="font-medium">{salesReturn.net_return_amount.toFixed(2)}</p></div>
          <div><p className="label">Total Quantity</p><p>{salesReturn.total_return_quantity}</p></div>
          <div><p className="label">Return Reason</p><p>{salesReturn.return_reason?.label ?? '—'}</p></div>
          <div><p className="label">Validation Status</p><p className="capitalize">{salesReturn.validation_status.replace(/_/g, ' ')}</p></div>
          <div><p className="label">Replacement Requested</p><p>{salesReturn.replacement_requested ? 'Yes' : 'No'}</p></div>
          <div><p className="label">Route</p><p>{salesReturn.route?.name ?? '—'}</p></div>
          <div><p className="label">Van</p><p>{salesReturn.van ? `${salesReturn.van.code} — ${salesReturn.van.name}` : '—'}</p></div>
          <div><p className="label">Source</p><p className="capitalize">{salesReturn.return_source}</p></div>
          <div><p className="label">Customer Reference</p><p>{salesReturn.customer_reference ?? '—'}</p></div>
          <div><p className="label">Complaint Reference</p><p>{salesReturn.customer_complaint_reference ?? '—'}</p></div>
        </div>
      )}

      {tab === 'items' && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-700">
                <th className="p-3">Product</th><th className="p-3">Qty</th><th className="p-3">Condition</th>
                <th className="p-3">Reason</th><th className="p-3">Unit Price</th><th className="p-3">Net Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="p-3">{i.product?.name ?? i.description}{i.is_free_item && <span className="ml-1 text-xs text-purple-600">(Free)</span>}</td>
                  <td className="p-3">{i.return_quantity}</td>
                  <td className="p-3">{i.return_condition?.label ?? '—'}</td>
                  <td className="p-3">{i.return_reason?.label ?? '—'}</td>
                  <td className="p-3">{i.unit_price.toFixed(2)}</td>
                  <td className="p-3">{i.net_return_amount.toFixed(2)}</td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-slate-400">No return items.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'batches' && (
        <div className="space-y-2">
          {items.filter((i) => i.batch_required).map((i) => (
            <div key={i.id} className="card p-3 text-sm">
              <p className="font-medium">{i.product?.name}</p>
              {(i.batches ?? []).map((b) => (
                <p key={b.batch_id} className="text-xs text-slate-500">Batch {b.batch?.batch_no ?? b.batch_id} — {b.return_quantity}</p>
              ))}
              {(!i.batches || i.batches.length === 0) && <p className="text-xs text-amber-600">No batch selected — batch tracking required.</p>}
            </div>
          ))}
          {items.filter((i) => i.batch_required).length === 0 && <p className="text-sm text-slate-500">No batch-tracked items on this return.</p>}
        </div>
      )}

      {tab === 'serials' && (
        <div className="space-y-2">
          {items.filter((i) => i.serial_required).map((i) => (
            <div key={i.id} className="card p-3 text-sm">
              <p className="font-medium">{i.product?.name}</p>
              {(i.serials ?? []).map((s) => (
                <p key={s.serial_id} className="text-xs text-slate-500">Serial {s.serial?.serial_no ?? s.serial_id} — <span className="capitalize">{s.return_status.replace(/_/g, ' ')}</span></p>
              ))}
              {(!i.serials || i.serials.length === 0) && <p className="text-xs text-amber-600">No serials recorded — serial tracking required.</p>}
            </div>
          ))}
          {items.filter((i) => i.serial_required).length === 0 && <p className="text-sm text-slate-500">No serial-tracked items on this return.</p>}
        </div>
      )}

      {tab === 'pricing' && (
        <div className="card grid grid-cols-2 gap-4 p-4 sm:grid-cols-3">
          <div><p className="label">Gross Return Amount</p><p className="font-medium">{salesReturn.gross_return_amount.toFixed(2)}</p></div>
          <div><p className="label">Discount Reversal</p><p>{salesReturn.discount_reversal_amount.toFixed(2)}</p></div>
          <div><p className="label">Promotion Reversal</p><p>{salesReturn.promotion_reversal_amount.toFixed(2)}</p></div>
          <div><p className="label">Tax Reversal</p><p>{salesReturn.tax_reversal_amount.toFixed(2)}</p></div>
          <div className="col-span-2 sm:col-span-3"><p className="label">Net Return Amount</p><p className="text-lg font-bold">{salesReturn.net_return_amount.toFixed(2)}</p></div>
          <p className="col-span-2 text-xs text-slate-400 sm:col-span-3">
            Calculated from the original invoice's stored price, discount, and tax figures — not current pricing. Actual credit note generation and posting happen only after inspection and approval, on the Credit Note tab.
          </p>
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
                    <PermissionGate permission="sales_returns:approve_return">
                      <button className="btn-secondary !py-1 text-xs text-green-600" onClick={() => processAction(s.id, 'approve')}>Approve</button>
                    </PermissionGate>
                    <PermissionGate permission="sales_returns:reject_return">
                      <button className="btn-secondary !py-1 text-xs text-red-600" onClick={() => {
                        const reason = prompt('Reason for rejection:');
                        if (reason) processAction(s.id, 'reject', reason);
                      }}>Reject</button>
                    </PermissionGate>
                    <PermissionGate permission="sales_returns:return_for_correction">
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

      {tab === 'inspection' && (
        <div className="space-y-2">
          <p className="text-sm text-slate-500">Inspection status: <span className="font-medium capitalize">{(inspectionStatus ?? 'not started').replace(/_/g, ' ')}</span></p>
          {inspectionItems.map((i) => (
            <div key={i.id} className="card p-3 text-sm">
              <p className="font-medium">{i.return_item?.product?.name ?? '—'}</p>
              <p className="text-xs text-slate-500">Requested {i.requested_quantity} · Inspected {i.inspected_quantity}</p>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5 text-xs">
                <div><p className="label">Saleable</p><p>{i.accepted_saleable_quantity}</p></div>
                <div><p className="label">Damaged</p><p>{i.accepted_damaged_quantity}</p></div>
                <div><p className="label">Expired</p><p>{i.accepted_expired_quantity}</p></div>
                <div><p className="label">Quarantine</p><p>{i.quarantine_quantity}</p></div>
                <div><p className="label">Rejected</p><p>{i.rejected_quantity}</p></div>
              </div>
              {inspectionStatus === 'in_progress' && (
                <PermissionGate permission="sales_returns:inspect_return">
                  <button
                    className="btn-secondary !py-1 mt-2 text-xs"
                    onClick={() => {
                      const saleable = Number(prompt('Accepted saleable quantity:', String(i.requested_quantity)) ?? 0);
                      const conditionCode = returnConditions[0]?.code ?? 'good';
                      recordResult(i.id, { inspectedQuantity: i.requested_quantity, acceptedSaleable: saleable, conditionCode, saleableStatus: 'saleable' });
                    }}
                  >
                    Quick Accept as Saleable
                  </button>
                </PermissionGate>
              )}
            </div>
          ))}
          {inspectionItems.length === 0 && <p className="text-sm text-slate-500">No inspection started yet.</p>}
        </div>
      )}

      {tab === 'stock_posting' && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-700">
                <th className="p-3">Product</th><th className="p-3">Destination</th><th className="p-3">Quantity</th><th className="p-3">Location</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => i.batch_required || i.serial_required ? null : (
                <tr key={i.id} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="p-3">{i.product?.name}</td>
                  <td className="p-3 capitalize">{(i as any).posted_stock_destination?.replace(/_/g, ' ') ?? 'not yet posted'}</td>
                  <td className="p-3">{i.return_quantity}</td>
                  <td className="p-3">{salesReturn.van ? `Van: ${salesReturn.van.name}` : 'Warehouse'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="p-3 text-xs text-slate-400">Damaged, expired, and quarantine quantities are recorded separately from saleable stock and are never available for sale until released.</p>
        </div>
      )}

      {tab === 'credit_note' && (
        <div className="space-y-4">
          {creditNote ? (
            <div className="card p-4 text-sm">
              <p className="font-medium">{creditNote.credit_note_number}</p>
              <p className="text-xs capitalize text-slate-500">{creditNote.status.replace(/_/g, ' ')}</p>
              <p className="mt-2 text-lg font-bold">{creditNote.approved_credit_amount.toFixed(2)}</p>
              {creditNote.reason && <p className="mt-1 text-xs text-slate-500">Reason: {creditNote.reason}</p>}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No credit note generated yet.</p>
          )}
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
              {h.final_return_number && <p className="text-slate-500">Final number: {h.final_return_number}</p>}
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
