import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, ClipboardList, Package, Layers, Barcode, Calculator, StickyNote, History as HistoryIcon, XCircle } from 'lucide-react';
import { useSalesReturnDetail, useSalesReturnNotes, useSalesReturnStatusHistory } from '@/hooks/useSalesReturnDetail';
import { useSalesReturns } from '@/hooks/useSalesReturns';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';

type Tab = 'overview' | 'items' | 'batches' | 'serials' | 'pricing' | 'notes' | 'audit';

const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: 'overview', label: 'Overview', icon: ClipboardList },
  { key: 'items', label: 'Return Items', icon: Package },
  { key: 'batches', label: 'Batches', icon: Layers },
  { key: 'serials', label: 'Serials', icon: Barcode },
  { key: 'pricing', label: 'Pricing Preview', icon: Calculator },
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
  const { push } = useToast();
  const [newNote, setNewNote] = useState('');

  if (loading || !salesReturn) return <p className="text-center text-slate-400">Loading…</p>;

  const handleSubmit = async () => {
    const { error } = await submitReturn(salesReturn.id);
    if (error) { push('error', error); return; }
    push('success', 'Return submitted.');
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
        <div className="flex gap-2">
          {(salesReturn.status === 'draft' || salesReturn.status === 'pending_submission') && (
            <PermissionGate permission="sales_returns:create">
              <button className="btn-primary" onClick={handleSubmit}><Send size={16} /> Submit</button>
            </PermissionGate>
          )}
          {salesReturn.status !== 'cancelled_before_posting' && (
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
            Calculated from the original invoice's stored price, discount, and tax figures — not current pricing. This is a preview only; no credit note or customer balance change happens in this phase.
          </p>
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
