import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, ClipboardList, CreditCard, ListChecks, StickyNote, History as HistoryIcon, XCircle } from 'lucide-react';
import { useReceiptVoucherDetail, useReceiptNotes, useReceiptStatusHistory } from '@/hooks/useReceiptVoucherDetail';
import { useReceiptVouchers } from '@/hooks/useReceiptVouchers';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';

type Tab = 'overview' | 'components' | 'allocations' | 'notes' | 'audit';

const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: 'overview', label: 'Overview', icon: ClipboardList },
  { key: 'components', label: 'Payment Components', icon: CreditCard },
  { key: 'allocations', label: 'Invoice Allocations', icon: ListChecks },
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
  const { push } = useToast();
  const [newNote, setNewNote] = useState('');

  if (loading || !receipt) return <p className="text-center text-slate-400">Loading…</p>;

  const handleSubmit = async () => {
    const { error } = await submitReceipt(receipt.id);
    if (error) { push('error', error); return; }
    push('success', 'Receipt submitted.');
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
        <div className="flex gap-2">
          {(receipt.status === 'draft' || receipt.status === 'pending_submission') && (
            <PermissionGate permission="receipt_vouchers:create">
              <button className="btn-primary" onClick={handleSubmit}><Send size={16} /> Submit</button>
            </PermissionGate>
          )}
          {receipt.status !== 'cancelled_before_posting' && (
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
