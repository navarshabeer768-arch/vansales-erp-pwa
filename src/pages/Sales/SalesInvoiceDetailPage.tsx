import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, ClipboardList, Tag, Calculator, StickyNote, History as HistoryIcon, XCircle, Percent, PackageCheck, Wallet, ShieldCheck, PauseCircle, PlayCircle, Printer } from 'lucide-react';
import { useSalesInvoiceDetail, useSalesInvoiceNotes, useSalesInvoiceStatusHistory } from '@/hooks/useSalesInvoiceDetail';
import { useSalesInvoices } from '@/hooks/useSalesInvoices';
import { useInvoiceRequests } from '@/hooks/useInvoiceRequests';
import { useInvoiceStockValidation, useInvoiceCreditValidation, useInvoiceApprovals, useInvoiceHold, useInvoicePosting, useInvoicePostingHistory } from '@/hooks/useInvoicePosting';
import { useInvoiceVoidRequest } from '@/hooks/useInvoiceVoidRequest';
import { PrintInvoiceModal } from '@/components/sales/PrintInvoiceModal';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';

type Tab = 'overview' | 'items' | 'pricing' | 'totals' | 'stock' | 'credit' | 'approvals' | 'requests' | 'posting' | 'notes' | 'audit';

const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: 'overview', label: 'Overview', icon: ClipboardList },
  { key: 'items', label: 'Items', icon: Tag },
  { key: 'pricing', label: 'Pricing', icon: Tag },
  { key: 'totals', label: 'Totals', icon: Calculator },
  { key: 'stock', label: 'Stock', icon: PackageCheck },
  { key: 'credit', label: 'Credit', icon: Wallet },
  { key: 'approvals', label: 'Approvals', icon: ShieldCheck },
  { key: 'requests', label: 'Requests', icon: Percent },
  { key: 'posting', label: 'Posting', icon: HistoryIcon },
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
  const { rows: stockValidations, runValidation: runStockValidation } = useInvoiceStockValidation(invoiceId);
  const { rows: creditValidations, runValidation: runCreditValidation, requestOverride: requestCreditOverride } = useInvoiceCreditValidation(invoiceId);
  const { overallStatus: approvalOverallStatus, steps: approvalSteps, submitForApproval, processAction } = useInvoiceApprovals(invoiceId);
  const { history: holdHistory, placeOnHold, releaseHold } = useInvoiceHold(invoiceId);
  const { posting, postInvoice, retryPosting } = useInvoicePosting();
  const { history: postingHistory } = useInvoicePostingHistory(invoiceId);
  const { request: voidRequest, createVoidRequest } = useInvoiceVoidRequest(invoiceId);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const { push } = useToast();
  const [newNote, setNewNote] = useState('');

  if (loading || !invoice) return <p className="text-center text-slate-400">Loading…</p>;

  const handleRequestVoid = async () => {
    const reason = prompt('Reason for requesting a void of this posted invoice:');
    if (!reason) return;
    const { error } = await createVoidRequest(reason);
    if (error) { push('error', error); return; }
    push('success', 'Void request submitted.');
    reload();
  };

  const handleSubmit = async () => {
    const { error } = await submitInvoice(invoice.id);
    if (error) { push('error', error); return; }
    push('success', 'Invoice submitted.');
    reload();
  };

  const handleSubmitForApproval = async () => {
    const { error } = await submitForApproval();
    if (error) { push('error', error); return; }
    push('success', 'Submitted for approval — stock and credit revalidated.');
    reload();
  };

  const handlePost = async () => {
    if (!confirm('Post this invoice? This will deduct real stock, consume credit, and cannot be undone through editing.')) return;
    const { data, error } = await postInvoice(invoice.id);
    if (error) { push('error', error); reload(); return; }
    push('success', `Invoice posted — final number ${(data as any)?.final_invoice_number ?? invoice.invoice_number}.`);
    reload();
  };

  const handleRetryPosting = async () => {
    const { error } = await retryPosting(invoice.id);
    if (error) { push('error', error); reload(); return; }
    push('success', 'Posting retried successfully.');
    reload();
  };

  const handlePlaceOnHold = async () => {
    const reason = prompt('Hold reason (credit_review/stock_review/price_review/tax_review/customer_issue/management_review/sync_conflict/other):', 'management_review');
    if (!reason) return;
    const notes = prompt('Hold notes (optional):') ?? undefined;
    const { error } = await placeOnHold(reason, notes);
    if (error) { push('error', error); return; }
    push('success', 'Invoice placed on hold.');
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
            {voidRequest && <span className="ml-2 text-rose-600">· Void {voidRequest.approval_status}</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {invoice.status === 'draft' && (
            <PermissionGate permission="sales_invoices:submit_for_approval">
              <button className="btn-secondary" onClick={handleSubmitForApproval}><Send size={16} /> Submit for Approval</button>
            </PermissionGate>
          )}
          {(invoice.status === 'draft' || invoice.status === 'pending_submission') && (
            <PermissionGate permission="sales_invoices:create">
              <button className="btn-secondary" onClick={handleSubmit}><Send size={16} /> Submit</button>
            </PermissionGate>
          )}
          {(invoice.status === 'approved' || invoice.status === 'ready_to_post') && (
            <PermissionGate permission="sales_invoices:post_invoice">
              <button className="btn-primary" onClick={handlePost} disabled={posting}>{posting ? 'Posting…' : 'Post Invoice'}</button>
            </PermissionGate>
          )}
          {invoice.status === 'posting_failed' && (
            <PermissionGate permission="sales_invoices:retry_failed_posting">
              <button className="btn-primary" onClick={handleRetryPosting} disabled={posting}>{posting ? 'Retrying…' : 'Retry Posting'}</button>
            </PermissionGate>
          )}
          {!invoice.is_on_hold && !['posted', 'cancelled_before_posting', 'voided'].includes(invoice.status) && (
            <PermissionGate permission="sales_invoices:place_on_hold">
              <button className="btn-secondary" onClick={handlePlaceOnHold}><PauseCircle size={16} /> Hold</button>
            </PermissionGate>
          )}
          {invoice.is_on_hold && holdHistory.find((h) => !h.released_by) && (
            <PermissionGate permission="sales_invoices:release_hold">
              <button className="btn-primary" onClick={() => releaseHold(holdHistory.find((h) => !h.released_by)!.id)}><PlayCircle size={16} /> Release Hold</button>
            </PermissionGate>
          )}
          {invoice.status === 'posted' && (
            <PermissionGate permission="sales_invoices:print_invoice">
              <button className="btn-secondary" onClick={() => setPrintModalOpen(true)}><Printer size={16} /> Print</button>
            </PermissionGate>
          )}
          {invoice.status === 'posted' && !voidRequest && (
            <PermissionGate permission="sales_invoices:request_void">
              <button className="btn-secondary text-red-600" onClick={handleRequestVoid}><XCircle size={16} /> Request Void</button>
            </PermissionGate>
          )}
          {invoice.status !== 'cancelled_before_posting' && invoice.status !== 'posted' && (
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

      {tab === 'stock' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Stock Validation</h3>
            <PermissionGate permission="sales_invoices:validate_stock">
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
        </div>
      )}

      {tab === 'credit' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Credit Validation</h3>
            <PermissionGate permission="sales_invoices:validate_credit">
              <button className="btn-secondary" onClick={runCreditValidation}>Revalidate Credit</button>
            </PermissionGate>
          </div>
          <div className="space-y-2">
            {creditValidations.map((c) => (
              <div key={c.id} className="card p-3 text-sm">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div><p className="label">Available Before</p><p>{c.available_credit_before}</p></div>
                  <div><p className="label">Invoice Amount</p><p>{c.invoice_credit_amount}</p></div>
                  <div><p className="label">Available After</p><p>{c.available_credit_after}</p></div>
                  <div><p className="label">Status</p><p className="capitalize">{c.status.replace(/_/g, ' ')}</p></div>
                </div>
                {c.block_reason && <p className="mt-1 text-amber-600">{c.block_reason}</p>}
              </div>
            ))}
            {creditValidations.length === 0 && <p className="text-sm text-slate-500">Not validated yet — only applies to credit/hybrid invoices.</p>}
          </div>
          {creditValidations[0]?.status && !['valid', 'not_validated'].includes(creditValidations[0].status) && (
            <PermissionGate permission="sales_invoices:request_credit_override">
              <button className="btn-secondary" onClick={async () => {
                const reason = prompt('Reason for requesting a credit override:');
                if (!reason) return;
                const { error } = await requestCreditOverride(reason);
                if (error) push('error', error); else push('success', 'Credit override requested.');
              }}>Request Credit Override</button>
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
                    <PermissionGate permission="sales_invoices:approve_invoice">
                      <button className="btn-secondary !py-1 text-xs text-green-600" onClick={() => processAction(s.id, 'approve')}>Approve</button>
                    </PermissionGate>
                    <PermissionGate permission="sales_invoices:reject_invoice">
                      <button className="btn-secondary !py-1 text-xs text-red-600" onClick={() => {
                        const reason = prompt('Reason for rejection:');
                        if (reason) processAction(s.id, 'reject', reason);
                      }}>Reject</button>
                    </PermissionGate>
                    <PermissionGate permission="sales_invoices:return_for_correction">
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

      {tab === 'posting' && (
        <div className="space-y-2">
          {postingHistory.map((h) => (
            <div key={h.id} className="card p-3 text-sm">
              <div className="flex items-center justify-between">
                <p className="font-medium">Attempt {h.attempt_number} — <span className={h.status === 'succeeded' ? 'text-green-600' : 'text-red-600'}>{h.status}</span></p>
                <span className="text-xs text-slate-400">{h.online ? 'Online' : 'Offline'}</span>
              </div>
              {h.final_invoice_number && <p className="text-slate-500">Final number: {h.final_invoice_number}</p>}
              {h.error_message && <p className="text-red-600">{h.error_message}</p>}
              <p className="text-xs text-slate-400">{new Date(h.attempted_at).toLocaleString()}</p>
            </div>
          ))}
          {postingHistory.length === 0 && <p className="text-sm text-slate-500">No posting attempts yet.</p>}
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

      <PrintInvoiceModal open={printModalOpen} onClose={() => setPrintModalOpen(false)} invoice={invoice} items={items} />
    </div>
  );
}
