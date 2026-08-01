import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, ClipboardList, Tag, Calculator, StickyNote, History as HistoryIcon, XCircle, Percent } from 'lucide-react';
import { useSalesInvoiceDetail, useSalesInvoiceNotes, useSalesInvoiceStatusHistory } from '@/hooks/useSalesInvoiceDetail';
import { useSalesInvoices } from '@/hooks/useSalesInvoices';
import { useInvoiceRequests } from '@/hooks/useInvoiceRequests';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';

type Tab = 'overview' | 'items' | 'pricing' | 'totals' | 'requests' | 'notes' | 'audit';

const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: 'overview', label: 'Overview', icon: ClipboardList },
  { key: 'items', label: 'Items', icon: Tag },
  { key: 'pricing', label: 'Pricing', icon: Tag },
  { key: 'totals', label: 'Totals', icon: Calculator },
  { key: 'requests', label: 'Requests', icon: Percent },
  { key: 'notes', label: 'Notes', icon: StickyNote },
  { key: 'audit', label: 'Audit History', icon: HistoryIcon },
];

export function SalesInvoiceDetailPage() {
  const { invoiceId } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');
  const { invoice, items, loading, reload } = useSalesInvoiceDetail(invoiceId);
  const { notes, addNote } = useSalesInvoiceNotes(invoiceId);
  const { history } = useSalesInvoiceStatusHistory(invoiceId);
  const { submitInvoice, cancelInvoice } = useSalesInvoices();
  const {
    priceRequests, discountRequests, freeQuantityRequests,
    requestPriceOverride, requestDiscountOverride, requestManualFreeQuantity,
  } = useInvoiceRequests(invoiceId);
  const { push } = useToast();
  const [newNote, setNewNote] = useState('');

  if (loading || !invoice) return <p className="text-center text-slate-400">Loading…</p>;

  const handleSubmit = async () => {
    const { error } = await submitInvoice(invoice.id);
    if (error) { push('error', error); return; }
    push('success', 'Invoice submitted.');
    reload();
  };

  const handleCancel = async () => {
    const reason = prompt('Reason for cancelling this draft:');
    if (!reason) return;
    const { error } = await cancelInvoice(invoice.id, reason);
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
      <button className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700" onClick={() => navigate('/sales/invoices')}>
        <ArrowLeft size={14} /> Back to Sales Invoices
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">{invoice.invoice_number}</h1>
          <p className="text-sm capitalize text-slate-500">
            {invoice.status.replace(/_/g, ' ')} · {invoice.invoice_type?.label} · {invoice.customer?.business_name ?? invoice.walk_in_name ?? 'Walk-in'}
          </p>
        </div>
        <div className="flex gap-2">
          {(invoice.status === 'draft' || invoice.status === 'pending_submission') && (
            <PermissionGate permission="sales_invoices:create">
              <button className="btn-primary" onClick={handleSubmit}><Send size={16} /> Submit</button>
            </PermissionGate>
          )}
          {invoice.status !== 'cancelled_before_posting' && (
            <PermissionGate permission="sales_invoices:cancel_draft">
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
          <div><p className="label">Invoice Date</p><p>{invoice.invoice_date}</p></div>
          <div><p className="label">Delivery Date</p><p>{invoice.delivery_date ?? '—'}</p></div>
          <div><p className="label">Route</p><p>{invoice.route?.name ?? '—'}</p></div>
          <div><p className="label">Van</p><p>{invoice.van ? `${invoice.van.code} — ${invoice.van.name}` : '—'}</p></div>
          <div><p className="label">Warehouse</p><p>{invoice.warehouse ? `${invoice.warehouse.code} — ${invoice.warehouse.name}` : '—'}</p></div>
          <div><p className="label">Salesman</p><p>{invoice.salesman?.full_name ?? '—'}</p></div>
          <div><p className="label">Payment Type</p><p className="capitalize">{invoice.payment_type}</p></div>
          <div><p className="label">Payment Term</p><p>{invoice.payment_term?.label ?? '—'}</p></div>
          <div><p className="label">Source</p><p>{invoice.sales_order_id ? 'Converted from Sales Order' : (invoice.direct_invoice_source?.replace(/_/g, ' ') ?? 'Direct')}</p></div>
          <div><p className="label">Customer Reference</p><p>{invoice.customer_reference ?? '—'}</p></div>
          <div><p className="label">Customer PO</p><p>{invoice.customer_po ?? '—'}</p></div>
          <div><p className="label">Tax Mode</p><p>{invoice.tax_inclusive ? 'Tax Inclusive' : 'Tax Exclusive'}</p></div>
        </div>
      )}

      {tab === 'items' && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-700">
                <th className="p-3">Seq</th><th className="p-3">Product</th><th className="p-3">Qty</th><th className="p-3">Unit</th>
                <th className="p-3">Price</th><th className="p-3">Net</th><th className="p-3">Free</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="p-3">{i.sequence}</td>
                  <td className="p-3">{i.product?.name ?? i.description}</td>
                  <td className="p-3">{i.invoice_quantity}</td>
                  <td className="p-3">{i.unit?.symbol ?? '—'}</td>
                  <td className="p-3">{i.applied_price.toFixed(2)}</td>
                  <td className="p-3">{i.net_amount.toFixed(2)}</td>
                  <td className="p-3">{i.is_free_item ? 'Yes' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'pricing' && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-700">
                <th className="p-3">Product</th><th className="p-3">Original Price</th><th className="p-3">Applied Price</th>
                <th className="p-3">Source</th><th className="p-3">Discount</th><th className="p-3">Tax</th><th className="p-3">Exempt</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="p-3">{i.product?.name ?? i.description}</td>
                  <td className="p-3">{i.original_price.toFixed(2)}</td>
                  <td className="p-3">{i.applied_price.toFixed(2)}</td>
                  <td className="p-3 capitalize">{i.price_source?.replace(/_/g, ' ') ?? '—'}</td>
                  <td className="p-3">{i.discount_pct}% ({i.discount_amount.toFixed(2)})</td>
                  <td className="p-3">{i.tax_rate}% ({i.tax_amount.toFixed(2)})</td>
                  <td className="p-3">{i.is_tax_exempt ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'totals' && (
        <div className="card grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
          <div><p className="label">Gross</p><p className="font-medium">{invoice.gross_amount.toFixed(2)}</p></div>
          <div><p className="label">Item Discount</p><p className="font-medium">{invoice.item_discount_amount.toFixed(2)}</p></div>
          <div><p className="label">Promotion Discount</p><p className="font-medium">{invoice.promotion_discount_amount.toFixed(2)}</p></div>
          <div><p className="label">Taxable Amount</p><p className="font-medium">{invoice.taxable_amount.toFixed(2)}</p></div>
          <div><p className="label">Tax</p><p className="font-medium">{invoice.tax_amount.toFixed(2)}</p></div>
          <div><p className="label">Round Off</p><p className="font-medium">{invoice.round_off.toFixed(2)}</p></div>
          <div><p className="label">Total Quantity</p><p className="font-medium">{invoice.total_quantity}</p></div>
          <div><p className="label">Free Quantity</p><p className="font-medium">{invoice.total_free_quantity}</p></div>
          <div className="col-span-2 sm:col-span-4"><p className="label">Net Amount</p><p className="text-lg font-bold">{invoice.net_amount.toFixed(2)}</p></div>
        </div>
      )}

      {tab === 'requests' && (
        <div className="space-y-6">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold">Price Override Requests</h3>
              <PermissionGate permission="sales_invoices:request_price_override">
                <button className="text-xs text-blue-600 hover:underline" onClick={async () => {
                  const itemLabel = items.map((i, idx) => `${idx + 1}. ${i.product?.name ?? i.description} (current price ${i.applied_price})`).join('\n');
                  const choice = prompt(`Which item? Enter its number:\n${itemLabel}`);
                  if (!choice) return;
                  const item = items[Number(choice) - 1];
                  if (!item) { push('error', 'Invalid item number.'); return; }
                  const requestedPrice = prompt('Requested price:');
                  if (!requestedPrice) return;
                  const reason = prompt('Reason for this price request:');
                  if (!reason) return;
                  const { error } = await requestPriceOverride(item.id, Number(requestedPrice), reason);
                  if (error) push('error', error); else push('success', 'Price override requested.');
                }}>Request Price Override</button>
              </PermissionGate>
            </div>
            <div className="space-y-2">
              {priceRequests.map((r) => (
                <div key={r.id} className="card p-3 text-sm">
                  <p>Original {r.original_price} → Requested {r.requested_price} · <span className="capitalize">{r.status}</span></p>
                  <p className="text-slate-500">{r.reason}</p>
                  <p className="text-xs text-slate-400">{new Date(r.request_time).toLocaleString()}</p>
                </div>
              ))}
              {priceRequests.length === 0 && <p className="text-sm text-slate-500">No price requests yet.</p>}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold">Discount Override Requests</h3>
              <PermissionGate permission="sales_invoices:request_discount_override">
                <button className="text-xs text-blue-600 hover:underline" onClick={async () => {
                  const itemLabel = items.map((i, idx) => `${idx + 1}. ${i.product?.name ?? i.description} (current discount ${i.discount_pct}%)`).join('\n');
                  const choice = prompt(`Which item? Enter its number:\n${itemLabel}`);
                  if (!choice) return;
                  const item = items[Number(choice) - 1];
                  if (!item) { push('error', 'Invalid item number.'); return; }
                  const requestedPct = prompt('Requested discount %:');
                  if (!requestedPct) return;
                  const allowedPct = prompt('Allowed discount % (from pricing rules):', String(item.discount_pct));
                  if (!allowedPct) return;
                  const reason = prompt('Reason for this discount request:');
                  if (!reason) return;
                  const { error } = await requestDiscountOverride(item.id, Number(requestedPct), Number(allowedPct), reason);
                  if (error) push('error', error); else push('success', 'Discount override requested.');
                }}>Request Discount Override</button>
              </PermissionGate>
            </div>
            <div className="space-y-2">
              {discountRequests.map((r) => (
                <div key={r.id} className="card p-3 text-sm">
                  <p>Requested {r.requested_discount_pct}% (allowed {r.allowed_discount_pct}%) · <span className="capitalize">{r.status}</span></p>
                  <p className="text-slate-500">{r.reason}</p>
                  <p className="text-xs text-slate-400">{new Date(r.request_time).toLocaleString()}</p>
                </div>
              ))}
              {discountRequests.length === 0 && <p className="text-sm text-slate-500">No discount requests yet.</p>}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold">Manual Free Quantity Requests</h3>
              <PermissionGate permission="sales_invoices:request_manual_free_quantity">
                <button className="text-xs text-blue-600 hover:underline" onClick={async () => {
                  const itemLabel = items.map((i, idx) => `${idx + 1}. ${i.product?.name ?? i.description}`).join('\n');
                  const choice = prompt(`Which item is this free quantity for? Enter its number:\n${itemLabel}`);
                  if (!choice) return;
                  const item = items[Number(choice) - 1];
                  if (!item) { push('error', 'Invalid item number.'); return; }
                  const requestedQty = prompt('Total requested free quantity:');
                  if (!requestedQty) return;
                  const schemeQty = prompt('Scheme-qualified free quantity (0 if none):', '0');
                  if (schemeQty === null) return;
                  const reason = prompt('Reason for the additional free quantity:');
                  if (!reason) return;
                  const { error } = await requestManualFreeQuantity(item.id, item.product_id, Number(requestedQty), Number(schemeQty), reason);
                  if (error) push('error', error); else push('success', 'Manual free quantity requested.');
                }}>Request Manual Free Quantity</button>
              </PermissionGate>
            </div>
            <div className="space-y-2">
              {freeQuantityRequests.map((r) => (
                <div key={r.id} className="card p-3 text-sm">
                  <p>Requested {r.requested_free_quantity} (scheme {r.scheme_free_quantity}, manual {r.additional_free_quantity}) · <span className="capitalize">{r.status}</span></p>
                  <p className="text-slate-500">{r.reason}</p>
                  <p className="text-xs text-slate-400">{new Date(r.request_time).toLocaleString()}</p>
                </div>
              ))}
              {freeQuantityRequests.length === 0 && <p className="text-sm text-slate-500">No free quantity requests yet.</p>}
            </div>
          </div>
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
          {(invoice.notes || invoice.internal_notes) && (
            <div className="card p-4 text-sm">
              {invoice.notes && <p><span className="font-medium">Invoice notes:</span> {invoice.notes}</p>}
              {invoice.internal_notes && <p className="mt-1"><span className="font-medium">Internal notes:</span> {invoice.internal_notes}</p>}
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
