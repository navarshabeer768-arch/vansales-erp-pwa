import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Trash2, ClipboardList, Tag, Percent, StickyNote, MapPin, History as HistoryIcon } from 'lucide-react';
import { useSalesOrderDetail, useSalesOrderNotes, useSalesOrderStatusHistory } from '@/hooks/useSalesOrderDetail';
import { useSalesOrders } from '@/hooks/useSalesOrders';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';

type Tab = 'overview' | 'items' | 'pricing' | 'discounts' | 'notes' | 'visit' | 'audit';

const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: 'overview', label: 'Overview', icon: ClipboardList },
  { key: 'items', label: 'Items', icon: Tag },
  { key: 'pricing', label: 'Pricing', icon: Tag },
  { key: 'discounts', label: 'Discounts', icon: Percent },
  { key: 'notes', label: 'Notes', icon: StickyNote },
  { key: 'visit', label: 'Visit', icon: MapPin },
  { key: 'audit', label: 'Audit History', icon: HistoryIcon },
];

export function SalesOrderDetailPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');
  const { order, items, loading, reload } = useSalesOrderDetail(orderId);
  const { notes, addNote } = useSalesOrderNotes(orderId);
  const { history } = useSalesOrderStatusHistory(orderId);
  const { submitOrder, cancelOrder, deleteDraft } = useSalesOrders();
  const { push } = useToast();
  const [newNote, setNewNote] = useState('');

  if (loading || !order) return <p className="text-center text-slate-400">Loading…</p>;

  const handleSubmit = async () => {
    const { error } = await submitOrder(order.id);
    if (error) { push('error', error); return; }
    push('success', 'Order submitted.');
    reload();
  };

  const handleCancel = async () => {
    const reason = prompt('Reason for cancelling this order:');
    if (!reason) return;
    const { error } = await cancelOrder(order.id, reason);
    if (error) { push('error', error); return; }
    push('success', 'Order cancelled.');
    reload();
  };

  const handleDelete = async () => {
    if (!confirm('Delete this draft order? This cannot be undone.')) return;
    const { error } = await deleteDraft(order.id);
    if (error) { push('error', error); return; }
    push('success', 'Draft deleted.');
    navigate('/sales/orders');
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    const { error } = await addNote(newNote.trim());
    if (error) { push('error', error); return; }
    setNewNote('');
  };

  return (
    <div className="space-y-6">
      <button className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700" onClick={() => navigate('/sales/orders')}>
        <ArrowLeft size={14} /> Back to Sales Orders
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">{order.order_number}</h1>
          <p className="text-sm capitalize text-slate-500">{order.status.replace(/_/g, ' ')} · {order.order_type?.label} · {order.customer?.business_name}</p>
        </div>
        <div className="flex gap-2">
          {(order.status === 'draft' || order.status === 'pending_submission') && (
            <PermissionGate permission="sales_orders:submit">
              <button className="btn-primary" onClick={handleSubmit}><Send size={16} /> Submit</button>
            </PermissionGate>
          )}
          {order.status === 'draft' && (
            <PermissionGate permission="sales_orders:delete_draft">
              <button className="btn-secondary text-red-600" onClick={handleDelete}><Trash2 size={16} /> Delete Draft</button>
            </PermissionGate>
          )}
          {order.status === 'submitted' && (
            <button className="btn-secondary" onClick={handleCancel}>Cancel Order</button>
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
          <div><p className="label">Order Date</p><p>{order.order_date}</p></div>
          <div><p className="label">Expected Delivery</p><p>{order.expected_delivery_date ?? '—'}</p></div>
          <div><p className="label">Route</p><p>{order.route?.name ?? '—'}</p></div>
          <div><p className="label">Van</p><p>{order.van ? `${order.van.code} — ${order.van.name}` : '—'}</p></div>
          <div><p className="label">Warehouse</p><p>{order.warehouse ? `${order.warehouse.code} — ${order.warehouse.name}` : '—'}</p></div>
          <div><p className="label">Salesman</p><p>{order.salesman?.full_name ?? '—'}</p></div>
          <div><p className="label">Payment Term</p><p>{order.payment_term?.label ?? '—'}</p></div>
          <div><p className="label">Customer Reference</p><p>{order.customer_reference ?? '—'}</p></div>
          <div><p className="label">Customer PO</p><p>{order.customer_po ?? '—'}</p></div>
          <div><p className="label">Direct Order</p><p>{order.is_direct_order ? (order.direct_order_type ?? 'Yes') : 'No — from visit'}</p></div>
          <div className="sm:col-span-3 mt-2 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800 sm:grid-cols-6">
            <div><p className="label">Gross</p><p className="font-medium">{order.gross_amount.toFixed(2)}</p></div>
            <div><p className="label">Discount</p><p className="font-medium">{order.discount_amount.toFixed(2)}</p></div>
            <div><p className="label">Promo Discount</p><p className="font-medium">{order.promotion_discount_amount.toFixed(2)}</p></div>
            <div><p className="label">Tax</p><p className="font-medium">{order.tax_amount.toFixed(2)}</p></div>
            <div><p className="label">Round Off</p><p className="font-medium">{order.round_off.toFixed(2)}</p></div>
            <div><p className="label">Net Amount</p><p className="text-lg font-bold">{order.net_amount.toFixed(2)}</p></div>
          </div>
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
                  <td className="p-3">{i.ordered_quantity}</td>
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
                <th className="p-3">Product</th><th className="p-3">Original Price</th><th className="p-3">Applied Price</th><th className="p-3">Source</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="p-3">{i.product?.name ?? i.description}</td>
                  <td className="p-3">{i.original_price.toFixed(2)}</td>
                  <td className="p-3">{i.applied_price.toFixed(2)}</td>
                  <td className="p-3 capitalize">{i.price_source?.replace(/_/g, ' ') ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'discounts' && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-700">
                <th className="p-3">Product</th><th className="p-3">Discount %</th><th className="p-3">Discount Amount</th><th className="p-3">Source</th>
              </tr>
            </thead>
            <tbody>
              {items.filter((i) => i.discount_amount > 0).map((i) => (
                <tr key={i.id} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="p-3">{i.product?.name ?? i.description}</td>
                  <td className="p-3">{i.discount_pct}%</td>
                  <td className="p-3">{i.discount_amount.toFixed(2)}</td>
                  <td className="p-3 capitalize">{i.discount_source?.replace(/_/g, ' ') ?? '—'}</td>
                </tr>
              ))}
              {items.every((i) => i.discount_amount === 0) && (
                <tr><td colSpan={4} className="p-4 text-center text-slate-400">No discounts applied.</td></tr>
              )}
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
          {(order.notes || order.internal_notes) && (
            <div className="card p-4 text-sm">
              {order.notes && <p><span className="font-medium">Order notes:</span> {order.notes}</p>}
              {order.internal_notes && <p className="mt-1"><span className="font-medium">Internal notes:</span> {order.internal_notes}</p>}
            </div>
          )}
        </div>
      )}

      {tab === 'visit' && (
        <div className="card p-4">
          {order.daily_visit_plan ? (
            <div className="space-y-2 text-sm">
              <p><span className="label">Daily Visit Plan Date</span> {order.daily_visit_plan.plan_date}</p>
              <p><span className="label">Beat Plan</span> {order.beat_plan?.beat_name ?? '—'}</p>
              <p><span className="label">Route</span> {order.route?.name ?? '—'}</p>
              <p className="text-slate-500">This order was taken during a planned visit.</p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              This is a direct order{order.direct_order_type ? ` (${order.direct_order_type})` : ''} — not linked to a planned visit.
            </p>
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
