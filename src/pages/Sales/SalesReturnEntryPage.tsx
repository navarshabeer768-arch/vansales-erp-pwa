import { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Undo2, WifiOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useCustomers } from '@/hooks/useCustomers';
import { useVans } from '@/hooks/useVans';
import { useMyVanIds } from '@/hooks/useVanAssignments';
import { useReturnCatalogs } from '@/hooks/useReturnCatalogs';
import { useCustomerInvoicesForReturn, useInvoiceReturnableItems } from '@/hooks/useInvoiceReturnable';
import { useInvoiceItemSoldBatchesSerials } from '@/hooks/useInvoiceItemSoldBatchesSerials';
import { useCreateSalesReturn, ReturnItemInput } from '@/hooks/useCreateSalesReturn';
import { useToast } from '@/contexts/ToastContext';

interface DraftLine {
  invoiceItemId: string;
  productId: string;
  productName: string;
  maxQuantity: number;
  returnQuantity: string;
  conditionCode: string;
  reasonCode: string;
  isFree: boolean;
  batchRequired: boolean;
  serialRequired: boolean;
  invoiceDate: string;
  selectedBatches: Record<string, string>;
  selectedSerials: string[];
}

function BatchSerialPicker({ line, onChange }: { line: DraftLine; onChange: (patch: Partial<DraftLine>) => void }) {
  const { batches, serials, loading } = useInvoiceItemSoldBatchesSerials(line.invoiceItemId);
  if (loading) return <p className="mt-2 text-xs text-slate-400">Loading batch/serial info…</p>;
  if (!line.batchRequired && !line.serialRequired) return null;

  return (
    <div className="mt-2 rounded-lg border border-slate-100 p-2 dark:border-slate-800">
      {line.batchRequired && (
        <div>
          <p className="text-xs font-medium text-slate-500">Select batch quantities (sold on this invoice):</p>
          {batches.map((b) => (
            <div key={b.batch_id} className="mt-1 flex items-center gap-2 text-xs">
              <span className="w-32">{b.batch_no}{b.expiry_date && ` (exp ${b.expiry_date})`}</span>
              <input
                type="number" min={0} max={b.allocated_quantity} className="input !w-20 !py-1"
                value={line.selectedBatches[b.batch_id] ?? ''}
                onChange={(e) => onChange({ selectedBatches: { ...line.selectedBatches, [b.batch_id]: e.target.value } })}
              />
            </div>
          ))}
          {batches.length === 0 && <p className="text-xs text-amber-600">No batch allocation found for this invoice item.</p>}
        </div>
      )}
      {line.serialRequired && (
        <div className="mt-2">
          <p className="text-xs font-medium text-slate-500">Select serials to return:</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {serials.map((s) => (
              <label key={s.serial_id} className="flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-700">
                <input
                  type="checkbox" checked={line.selectedSerials.includes(s.serial_id)}
                  onChange={(e) => onChange({
                    selectedSerials: e.target.checked ? [...line.selectedSerials, s.serial_id] : line.selectedSerials.filter((id) => id !== s.serial_id),
                  })}
                />
                {s.serial_no}
              </label>
            ))}
            {serials.length === 0 && <p className="text-xs text-amber-600">No serials found for this invoice item.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export function SalesReturnEntryPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { push } = useToast();
  const { customers } = useCustomers();
  const { vans } = useVans();
  const myVanIds = useMyVanIds();
  const accessibleVans = myVanIds === null ? vans : vans.filter((v) => myVanIds.has(v.id));
  const { returnTypes, returnReasons, returnConditions } = useReturnCatalogs();
  const { submit, submitting } = useCreateSalesReturn();

  const [customerId, setCustomerId] = useState(searchParams.get('customer_id') ?? '');
  const [invoiceId, setInvoiceId] = useState('');
  const [returnTypeCode, setReturnTypeCode] = useState('sales_return');
  const [vanId, setVanId] = useState('');
  const [defaultReasonCode, setDefaultReasonCode] = useState('wrong_item_supplied');
  const [lines, setLines] = useState<Record<string, DraftLine>>({});
  const [customerReference, setCustomerReference] = useState('');
  const [notes, setNotes] = useState('');
  const [isOffline] = useState(!navigator.onLine);

  const customerVisitId = searchParams.get('visit_id') ?? undefined;
  const dailyVisitPlanId = searchParams.get('plan_id') ?? undefined;

  const { invoices } = useCustomerInvoicesForReturn(customerId || undefined);
  const { items: returnableItems, loading: itemsLoading } = useInvoiceReturnableItems(invoiceId || undefined);
  const selectedInvoiceDate = invoices.find((inv) => inv.id === invoiceId)?.invoice_date ?? null;
  const daysSinceInvoice = selectedInvoiceDate ? Math.floor((Date.now() - new Date(selectedInvoiceDate).getTime()) / 86400000) : null;
  const RETURN_PERIOD_DAYS = 30;

  const toggleLine = (item: (typeof returnableItems)[number], checked: boolean) => {
    setLines((prev) => {
      const next = { ...prev };
      if (checked) {
        next[item.invoice_item_id] = {
          invoiceItemId: item.invoice_item_id, productId: item.product_id, productName: item.product_name,
          maxQuantity: item.remaining_returnable_quantity, returnQuantity: String(item.remaining_returnable_quantity),
          conditionCode: 'good', reasonCode: defaultReasonCode, isFree: item.is_free_item,
          batchRequired: item.batch_required, serialRequired: item.serial_required,
          invoiceDate: selectedInvoiceDate ?? '', selectedBatches: {}, selectedSerials: [],
        };
      } else {
        delete next[item.invoice_item_id];
      }
      return next;
    });
  };

  const updateLine = (invoiceItemId: string, patch: Partial<DraftLine>) => {
    setLines((prev) => ({ ...prev, [invoiceItemId]: { ...prev[invoiceItemId], ...patch } }));
  };

  const selectedLines = useMemo(() => Object.values(lines), [lines]);

  const handleSave = async (submitAfter: boolean) => {
    if (!customerId) { push('error', 'Select a customer.'); return; }
    if (selectedLines.length === 0) { push('error', 'Select at least one item to return.'); return; }

    for (const l of selectedLines) {
      const { data: duplicates } = await supabase.rpc('check_duplicate_return_warning', {
        p_customer_id: customerId, p_invoice_item_id: l.invoiceItemId, p_product_id: l.productId, p_return_quantity: Number(l.returnQuantity),
      });
      if (duplicates && duplicates.length > 0) {
        const list = duplicates.map((d: any) => `${d.return_number} (${d.return_date}, matched on ${d.matched_on.replace(/_/g, ' ')})`).join('\n');
        if (!confirm(`Possible duplicate return for ${l.productName}:\n${list}\n\nSave anyway?`)) return;
      }
    }

    const items: ReturnItemInput[] = selectedLines.map((l) => ({
      invoice_item_id: l.invoiceItemId,
      product_id: l.productId,
      return_quantity: Number(l.returnQuantity),
      base_return_quantity: Number(l.returnQuantity),
      is_free_item: l.isFree,
      condition_code: l.conditionCode,
      reason_code: l.reasonCode,
      batches: Object.entries(l.selectedBatches).filter(([, qty]) => Number(qty) > 0).map(([batch_id, qty]) => ({ batch_id, quantity: Number(qty) })),
      serials: l.selectedSerials,
    }));

    const { data, error } = await submit({
      returnTypeCode,
      customerId,
      items,
      originalInvoiceId: invoiceId || null,
      returnReasonCode: defaultReasonCode,
      vanId: vanId || null,
      responsibleEmployeeId: user?.id ?? null,
      customerVisitId: customerVisitId ?? null,
      dailyVisitPlanId: dailyVisitPlanId ?? null,
      returnSource: dailyVisitPlanId ? 'route' : 'office',
      customerReference: customerReference || null,
      notes: notes || null,
      isOffline,
    });
    if (error) { push('error', error); return; }
    if (submitAfter && data) {
      const { error: subErr } = await supabase.rpc('change_return_status_notified', { p_return_id: data, p_new_status: 'submitted' });
      if (subErr) { push('error', `Draft saved but could not submit: ${subErr.message}`); navigate(`/sales/returns/${data}`); return; }
    }
    push('success', submitAfter ? 'Return submitted.' : 'Return saved as draft.');
    if (data) navigate(`/sales/returns/${data}`);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-lg font-bold text-slate-800 dark:text-slate-100">
          <Undo2 size={20} /> New Sales Return
        </h1>
        {isOffline && <span className="flex items-center gap-1 text-xs text-red-500"><WifiOff size={14} /> Offline — will sync later</span>}
      </div>

      <div className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">Customer</label>
          <select className="input" value={customerId} onChange={(e) => { setCustomerId(e.target.value); setInvoiceId(''); setLines({}); }}>
            <option value="">Select customer…</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.customer_code} — {c.business_name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Return Type</label>
          <select className="input" value={returnTypeCode} onChange={(e) => setReturnTypeCode(e.target.value)}>
            {returnTypes.map((t) => <option key={t.id} value={t.code}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Van</label>
          <select className="input" value={vanId} onChange={(e) => setVanId(e.target.value)}>
            <option value="">—</option>
            {accessibleVans.map((v) => <option key={v.id} value={v.id}>{v.code} — {v.name}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label">Original Invoice</label>
          <select className="input" value={invoiceId} onChange={(e) => { setInvoiceId(e.target.value); setLines({}); }} disabled={!customerId}>
            <option value="">Select invoice…</option>
            {invoices.map((inv) => <option key={inv.id} value={inv.id}>{inv.final_invoice_number ?? inv.invoice_number} — {inv.invoice_date} — {inv.net_amount.toFixed(2)}</option>)}
          </select>
          {daysSinceInvoice !== null && daysSinceInvoice > RETURN_PERIOD_DAYS && (
            <p className="mt-1 text-xs font-medium text-amber-600">
              This invoice is {daysSinceInvoice} days old — outside the standard {RETURN_PERIOD_DAYS}-day return period. This return may require additional approval.
            </p>
          )}
        </div>
        <div className="sm:col-span-2">
          <label className="label">Default Return Reason</label>
          <select className="input" value={defaultReasonCode} onChange={(e) => setDefaultReasonCode(e.target.value)}>
            {returnReasons.map((r) => <option key={r.id} value={r.code}>{r.label}</option>)}
          </select>
        </div>
      </div>

      {invoiceId && (
        <div className="card p-4">
          <h3 className="mb-2 font-semibold">Returnable Items</h3>
          {itemsLoading && <p className="text-sm text-slate-500">Loading…</p>}
          {!itemsLoading && returnableItems.length === 0 && <p className="text-sm text-slate-500">No returnable items on this invoice.</p>}
          <div className="space-y-2">
            {returnableItems.map((item) => {
              const line = lines[item.invoice_item_id];
              return (
                <div key={item.invoice_item_id} className="rounded-lg border border-slate-100 p-3 dark:border-slate-800">
                  <label className="flex items-center gap-2 py-1">
                    <input type="checkbox" className="h-5 w-5" checked={!!line} onChange={(e) => toggleLine(item, e.target.checked)} />
                    <span className="font-medium">{item.product_name}</span>
                    <span className="text-xs text-slate-500">Remaining {item.remaining_returnable_quantity} {item.uom_label}</span>
                    {item.is_free_item && <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700 dark:bg-purple-900/30">Free</span>}
                  </label>
                  {line && (
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      <input
                        type="number" inputMode="decimal" className="input !h-[44px] text-base" placeholder="Quantity" min={0} max={line.maxQuantity}
                        value={line.returnQuantity} onChange={(e) => updateLine(item.invoice_item_id, { returnQuantity: e.target.value })}
                      />
                      <select className="input" value={line.conditionCode} onChange={(e) => updateLine(item.invoice_item_id, { conditionCode: e.target.value })}>
                        {returnConditions.map((c) => <option key={c.id} value={c.code}>{c.label}</option>)}
                      </select>
                      <select className="input" value={line.reasonCode} onChange={(e) => updateLine(item.invoice_item_id, { reasonCode: e.target.value })}>
                        {returnReasons.map((r) => <option key={r.id} value={r.code}>{r.label}</option>)}
                      </select>
                    </div>
                  )}
                  {line && <BatchSerialPicker line={line} onChange={(patch) => updateLine(item.invoice_item_id, patch)} />}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
        <div>
          <label className="label">Customer Reference</label>
          <input className="input" value={customerReference} onChange={(e) => setCustomerReference(e.target.value)} />
        </div>
        <div>
          <label className="label">Notes</label>
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>

      <div className="sticky bottom-0 card flex items-center justify-between p-4">
        <div>
          <p className="text-xs text-slate-500">Items Selected</p>
          <p className="text-xl font-bold">{selectedLines.length}</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary !min-h-[48px] !px-5" onClick={() => handleSave(false)} disabled={submitting}>Save Draft</button>
          <button className="btn-primary !min-h-[48px] !px-5" onClick={() => handleSave(true)} disabled={submitting}>Submit</button>
        </div>
      </div>
    </div>
  );
}
