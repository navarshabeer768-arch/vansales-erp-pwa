import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Send, Trash2, ClipboardList, Tag, Percent, StickyNote, MapPin, History as HistoryIcon,
  PackageCheck, Wallet, ShieldCheck, PauseCircle, PackageX, AlertOctagon,
} from 'lucide-react';
import { useSalesOrderDetail, useSalesOrderNotes, useSalesOrderStatusHistory } from '@/hooks/useSalesOrderDetail';
import { useSalesOrders } from '@/hooks/useSalesOrders';
import { useOrderStockValidation, useOrderStockReservations } from '@/hooks/useOrderStock';
import { useOrderCreditValidation, useOrderCreditReservation, useOrderCreditOverrides } from '@/hooks/useOrderCredit';
import { useOrderApprovals } from '@/hooks/useOrderApprovals';
import { useOrderHold, useOrderBackorders, useOrderCancellation, useOrderAmendments } from '@/hooks/useOrderControl';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';

type Tab = 'overview' | 'items' | 'pricing' | 'discounts' | 'stock' | 'credit' | 'approvals' | 'amendments' | 'notes' | 'visit' | 'audit';

const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: 'overview', label: 'Overview', icon: ClipboardList },
  { key: 'items', label: 'Items', icon: Tag },
  { key: 'pricing', label: 'Pricing', icon: Tag },
  { key: 'discounts', label: 'Discounts', icon: Percent },
  { key: 'stock', label: 'Stock', icon: PackageCheck },
  { key: 'credit', label: 'Credit', icon: Wallet },
  { key: 'approvals', label: 'Approvals', icon: ShieldCheck },
  { key: 'amendments', label: 'Amendments', icon: HistoryIcon },
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
  const { submitOrder, deleteDraft } = useSalesOrders();
  const { push } = useToast();
  const [newNote, setNewNote] = useState('');
  const { rows: stockValidations, runValidation: runStockValidation } = useOrderStockValidation(orderId);
  const { reservations, reserveItem, release: releaseReservation } = useOrderStockReservations(orderId);
  const { rows: creditValidations, runValidation: runCreditValidation } = useOrderCreditValidation(orderId);
  const { reservation: creditReservation, reserve: reserveCredit } = useOrderCreditReservation(orderId);
  const { requests: creditOverrides, requestOverride } = useOrderCreditOverrides(orderId);
  const { steps: approvalSteps, overallStatus: approvalOverallStatus, processAction } = useOrderApprovals(orderId);
  const { history: holdHistory, placeOnHold, releaseHold } = useOrderHold(orderId);
  const { backorders } = useOrderBackorders(orderId);
  const { cancelOrder: cancelOrderFull } = useOrderCancellation();
  const { amendments, createAmendment, approveAmendment } = useOrderAmendments(orderId);

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
    const { error } = await cancelOrderFull(order.id, reason);
    if (error) { push('error', error); return; }
    push('success', 'Order cancelled — stock and credit reservations released.');
    reload();
  };

  const handlePlaceOnHold = async () => {
    const reason = prompt('Hold reason (credit_review/stock_shortage/price_review/customer_issue/management_review/document_issue/other):', 'management_review');
    if (!reason) return;
    const notes = prompt('Hold notes (optional):') ?? undefined;
    const { error } = await placeOnHold(reason, notes);
    if (error) { push('error', error); return; }
    push('success', 'Order placed on hold.');
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
          {!order.is_on_hold && !['cancelled', 'closed', 'fully_converted', 'expired'].includes(order.status) && (
            <PermissionGate permission="sales_orders:place_on_hold">
              <button className="btn-secondary" onClick={handlePlaceOnHold}><PauseCircle size={16} /> Hold</button>
            </PermissionGate>
          )}
          {order.is_on_hold && holdHistory.find((h) => !h.released_by) && (
            <PermissionGate permission="sales_orders:release_hold">
              <button className="btn-primary" onClick={() => releaseHold(holdHistory.find((h) => !h.released_by)!.id)}>Release Hold</button>
            </PermissionGate>
          )}
          {!['cancelled', 'closed', 'fully_converted', 'expired'].includes(order.status) && (
            <PermissionGate permission="sales_orders:cancel_order">
              <button className="btn-secondary text-red-600" onClick={handleCancel}><AlertOctagon size={16} /> Cancel Order</button>
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

      {tab === 'stock' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Stock Validation — {order.stock_validation_status.replace(/_/g, ' ')}</h3>
            <PermissionGate permission="sales_orders:validate_stock">
              <button className="btn-secondary" onClick={runStockValidation}>Revalidate Stock</button>
            </PermissionGate>
          </div>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-700">
                  <th className="p-3">Location</th><th className="p-3">Requested</th><th className="p-3">Available</th>
                  <th className="p-3">Short</th><th className="p-3">Status</th><th className="p-3">Message</th>
                </tr>
              </thead>
              <tbody>
                {stockValidations.map((v) => (
                  <tr key={v.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="p-3 capitalize">{v.location_type}</td>
                    <td className="p-3">{v.requested_base_quantity}</td>
                    <td className="p-3">{v.available_quantity}</td>
                    <td className="p-3">{v.short_quantity}</td>
                    <td className="p-3 capitalize">{v.status.replace(/_/g, ' ')}</td>
                    <td className="p-3 text-xs text-slate-500">{v.validation_message}</td>
                  </tr>
                ))}
                {stockValidations.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-slate-400">Not validated yet.</td></tr>}
              </tbody>
            </table>
          </div>

          <h3 className="font-semibold">Stock Reservations</h3>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-700">
                  <th className="p-3">Location</th><th className="p-3">Reserved Qty</th><th className="p-3">Remaining</th>
                  <th className="p-3">Status</th><th className="p-3">Expiry</th><th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {reservations.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="p-3 capitalize">{r.location_type}</td>
                    <td className="p-3">{r.reserved_base_quantity}</td>
                    <td className="p-3">{r.remaining_quantity}</td>
                    <td className="p-3 capitalize">{r.status.replace(/_/g, ' ')}</td>
                    <td className="p-3">{r.expiry_date ? new Date(r.expiry_date).toLocaleString() : '—'}</td>
                    <td className="p-3 text-right">
                      {['active', 'partially_reserved', 'fully_reserved', 'pending'].includes(r.status) && (
                        <PermissionGate permission="sales_orders:release_reservation">
                          <button className="text-xs text-red-600 hover:underline" onClick={() => releaseReservation(r.id, 'Manually released')}>Release</button>
                        </PermissionGate>
                      )}
                    </td>
                  </tr>
                ))}
                {reservations.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-slate-400">No reservations yet.</td></tr>}
              </tbody>
            </table>
          </div>

          {backorders.length > 0 && (
            <>
              <h3 className="flex items-center gap-2 font-semibold text-amber-600"><PackageX size={16} /> Backorders</h3>
              <div className="card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-700">
                      <th className="p-3">Product</th><th className="p-3">Backorder Qty</th><th className="p-3">Priority</th><th className="p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backorders.map((b) => (
                      <tr key={b.id} className="border-b border-slate-100 dark:border-slate-800">
                        <td className="p-3">{b.product?.name ?? '—'}</td>
                        <td className="p-3">{b.backorder_quantity}</td>
                        <td className="p-3 capitalize">{b.priority}</td>
                        <td className="p-3 capitalize">{b.status.replace(/_/g, ' ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'credit' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Credit Validation — {order.credit_validation_status.replace(/_/g, ' ')}</h3>
            <PermissionGate permission="sales_orders:view_credit_validation">
              <button className="btn-secondary" onClick={runCreditValidation}>Revalidate Credit</button>
            </PermissionGate>
          </div>
          <div className="space-y-2">
            {creditValidations.map((c) => (
              <div key={c.id} className="card p-3 text-sm">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div><p className="label">Available Before</p><p>{c.available_credit_before}</p></div>
                  <div><p className="label">Order Amount</p><p>{c.current_order_credit_amount}</p></div>
                  <div><p className="label">Available After</p><p>{c.available_credit_after}</p></div>
                  <div><p className="label">Status</p><p className="capitalize">{c.status.replace(/_/g, ' ')}</p></div>
                </div>
                {c.block_reason && <p className="mt-1 text-amber-600">{c.block_reason}</p>}
              </div>
            ))}
            {creditValidations.length === 0 && <p className="text-sm text-slate-500">Not validated yet.</p>}
          </div>

          {order.credit_validation_status !== 'valid' && order.credit_validation_status !== 'not_validated' && (
            <PermissionGate permission="sales_orders:request_credit_override">
              <button className="btn-secondary" onClick={async () => {
                const reason = prompt('Reason for requesting a credit override:');
                if (!reason) return;
                const { error } = await requestOverride(reason);
                if (error) push('error', error); else push('success', 'Credit override requested.');
              }}>Request Credit Override</button>
            </PermissionGate>
          )}

          {creditOverrides.length > 0 && (
            <div className="card p-4">
              <h4 className="mb-2 font-semibold">Credit Override Requests</h4>
              {creditOverrides.map((r) => (
                <div key={r.id} className="border-b border-slate-100 py-2 text-sm last:border-0 dark:border-slate-800">
                  <p>Excess: {r.excess_amount} · Level: {r.approval_level} · <span className="capitalize">{r.status}</span></p>
                  <p className="text-slate-500">{r.reason}</p>
                </div>
              ))}
            </div>
          )}

          {creditReservation && (
            <div className="card p-4 text-sm">
              <h4 className="mb-2 font-semibold">Credit Reservation</h4>
              <p>Reserved: {creditReservation.reserved_amount} · Remaining: {creditReservation.remaining_amount} · <span className="capitalize">{creditReservation.status}</span></p>
            </div>
          )}
          {!creditReservation && order.credit_validation_status === 'valid' && (
            <PermissionGate permission="sales_orders:reserve_credit">
              <button className="btn-secondary" onClick={() => reserveCredit()}>Reserve Credit</button>
            </PermissionGate>
          )}
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
                    <PermissionGate permission="sales_orders:approve_order">
                      <button className="btn-secondary !py-1 text-xs text-green-600" onClick={() => processAction(s.id, 'approve')}>Approve</button>
                    </PermissionGate>
                    <PermissionGate permission="sales_orders:reject_order">
                      <button className="btn-secondary !py-1 text-xs text-red-600" onClick={() => {
                        const reason = prompt('Reason for rejection:');
                        if (reason) processAction(s.id, 'reject', reason);
                      }}>Reject</button>
                    </PermissionGate>
                    <PermissionGate permission="sales_orders:return_for_correction">
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
            {approvalSteps.length === 0 && <p className="text-sm text-slate-500">No approval steps — this order didn't trigger any approval requirement.</p>}
          </div>
        </div>
      )}

      {tab === 'amendments' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Amendments</h3>
            <PermissionGate permission="sales_orders:create_amendment">
              <button className="btn-secondary" onClick={async () => {
                const itemLabel = items.map((i, idx) => `${idx + 1}. ${i.product?.name ?? i.description} (qty ${i.ordered_quantity})`).join('\n');
                const choice = prompt(`Which item? Enter its number:\n${itemLabel}`);
                if (!choice) return;
                const idx = Number(choice) - 1;
                const item = items[idx];
                if (!item) { push('error', 'Invalid item number.'); return; }
                const action = prompt('Type "reduce" to reduce quantity or "remove" to remove the item entirely:', 'reduce');
                if (!action) return;
                const reason = prompt('Reason for this amendment:');
                if (!reason) return;
                let change: any;
                if (action === 'remove') {
                  change = { order_item_id: item.id, change_type: 'remove_item', old_value: { quantity: item.ordered_quantity }, new_value: { quantity: 0 } };
                } else {
                  const newQtyStr = prompt(`New quantity (currently ${item.ordered_quantity}):`);
                  if (!newQtyStr) return;
                  change = { order_item_id: item.id, change_type: 'reduce_quantity', old_value: { quantity: item.ordered_quantity }, new_value: { quantity: Number(newQtyStr) } };
                }
                const { error } = await createAmendment(reason, [change]);
                if (error) { push('error', error); return; }
                push('success', 'Amendment created — pending approval.');
              }}>New Amendment</button>
            </PermissionGate>
          </div>
          <div className="space-y-2">
            {amendments.map((a) => (
              <div key={a.id} className="card p-3 text-sm">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{a.amendment_number} <span className="text-xs text-slate-500">(v{a.version})</span></p>
                  <span className="capitalize">{a.status}</span>
                </div>
                <p className="text-slate-500">{a.reason}</p>
                <p className="text-xs text-slate-400">{new Date(a.request_date).toLocaleString()}</p>
                {a.status === 'pending' && (
                  <PermissionGate permission="sales_orders:approve_amendment">
                    <button className="btn-secondary !py-1 mt-2 text-xs text-green-600" onClick={() => approveAmendment(a.id)}>Approve Amendment</button>
                  </PermissionGate>
                )}
              </div>
            ))}
            {amendments.length === 0 && <p className="text-sm text-slate-500">No amendments yet — approved orders can only change through this workflow.</p>}
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
