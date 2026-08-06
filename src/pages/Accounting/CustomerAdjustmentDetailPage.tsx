import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, ClipboardList, Package, User, FileText, Link2, StickyNote, History as HistoryIcon, XCircle } from 'lucide-react';
import { useCustomerAdjustmentDetail, useCustomerAdjustments } from '@/hooks/useCustomerAdjustments';
import { useAdjustmentNotes, useAdjustmentStatusHistory } from '@/hooks/useCreditNotes';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';

type Tab = 'overview' | 'items' | 'customer' | 'invoice' | 'references' | 'notes' | 'sync' | 'audit';

const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: 'overview', label: 'Overview', icon: ClipboardList },
  { key: 'items', label: 'Items', icon: Package },
  { key: 'customer', label: 'Customer', icon: User },
  { key: 'invoice', label: 'Invoice', icon: FileText },
  { key: 'references', label: 'References', icon: Link2 },
  { key: 'notes', label: 'Notes', icon: StickyNote },
  { key: 'sync', label: 'Sync History', icon: HistoryIcon },
  { key: 'audit', label: 'Audit History', icon: HistoryIcon },
];

export function CustomerAdjustmentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');
  const { doc, items, loading, reload } = useCustomerAdjustmentDetail(id);
  const { notes, addNote } = useAdjustmentNotes('customer_adjustments', id);
  const { history } = useAdjustmentStatusHistory('customer_adjustments', id);
  const { submitDraft, cancelDraft } = useCustomerAdjustments();
  const { push } = useToast();
  const [newNote, setNewNote] = useState('');

  if (loading || !doc) return <p className="text-center text-slate-400">Loading…</p>;

  const handleSubmit = async () => {
    const { error } = await submitDraft(doc.id);
    if (error) { push('error', error); return; }
    push('success', 'Adjustment submitted.');
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
      <button className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700" onClick={() => navigate('/accounting/customer-adjustments')}>
        <ArrowLeft size={14} /> Back to Customer Adjustments
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">{doc.document_number}</h1>
          <p className="text-sm capitalize text-slate-500">{doc.status.replace(/_/g, ' ')} · {doc.document_type?.label} · {doc.customer?.business_name}</p>
        </div>
        <div className="flex gap-2">
          {doc.status === 'draft' && (
            <PermissionGate permission="financial_adjustments:create_adjustment">
              <button className="btn-primary" onClick={handleSubmit}><Send size={16} /> Submit</button>
            </PermissionGate>
          )}
          {doc.status !== 'cancelled' && (
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
          <div>
            <p className="label">Net Amount</p>
            <p className={`font-medium ${doc.net_direction === 'credit' ? 'text-green-600' : 'text-red-600'}`}>
              {doc.net_direction === 'debit' ? '+' : '-'}{doc.net_amount.toFixed(2)} ({doc.net_direction})
            </p>
          </div>
          <div><p className="label">Adjustment Type</p><p className="capitalize">{doc.adjustment_type.replace(/_/g, ' ')}</p></div>
          <div><p className="label">Reason</p><p>{doc.reason?.label ?? '—'}</p></div>
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
                    {i.original_price != null && `Price ${i.original_price.toFixed(2)} `}
                    {i.original_quantity != null && `Qty ${i.original_quantity} `}
                    {i.original_discount != null && `Discount ${i.original_discount.toFixed(2)} `}
                    {i.original_tax != null && `Tax ${i.original_tax.toFixed(2)}`}
                  </td>
                  <td className="p-3 text-xs text-slate-500">
                    {i.corrected_price != null && `Price ${i.corrected_price.toFixed(2)} `}
                    {i.corrected_quantity != null && `Qty ${i.corrected_quantity} `}
                    {i.corrected_discount != null && `Discount ${i.corrected_discount.toFixed(2)} `}
                    {i.corrected_tax != null && `Tax ${i.corrected_tax.toFixed(2)}`}
                  </td>
                  <td className="p-3 font-medium">{i.adjustment_amount.toFixed(2)}</td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={4} className="p-4 text-center text-slate-400">No items.</td></tr>}
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

      {tab === 'references' && (
        <div className="card p-4 text-sm">
          <p><span className="label">Reference Number:</span> {doc.reference_number ?? '—'}</p>
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
