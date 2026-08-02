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

  const toggleLine = (item: (typeof returnableItems)[number], checked: boolean) => {
    setLines((prev) => {
      const next = { ...prev };
      if (checked) {
        next[item.invoice_item_id] = {
          invoiceItemId: item.invoice_item_id, productId: item.product_id, productName: item.product_name,
          maxQuantity: item.remaining_returnable_quantity, returnQuantity: String(item.remaining_returnable_quantity),
          conditionCode: 'good', reasonCode: defaultReasonCode, isFree: item.is_free_item,
          batchRequired: item.batch_required, serialRequired: item.serial_required,
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

    const items: ReturnItemInput[] = selectedLines.map((l) => ({
      invoice_item_id: l.invoiceItemId,
      product_id: l.productId,
      return_quantity: Number(l.returnQuantity),
      base_return_quantity: Number(l.returnQuantity),
      is_free_item: l.isFree,
      condition_code: l.conditionCode,
      reason_code: l.reasonCode,
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
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={!!line} onChange={(e) => toggleLine(item, e.target.checked)} />
                    <span className="font-medium">{item.product_name}</span>
                    <span className="text-xs text-slate-500">Remaining {item.remaining_returnable_quantity} {item.uom_label}</span>
                    {item.is_free_item && <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700 dark:bg-purple-900/30">Free</span>}
                  </label>
                  {line && (
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      <input
                        type="number" className="input" placeholder="Quantity" min={0} max={line.maxQuantity}
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
          <button className="btn-secondary" onClick={() => handleSave(false)} disabled={submitting}>Save Draft</button>
          <button className="btn-primary" onClick={() => handleSave(true)} disabled={submitting}>Submit</button>
        </div>
      </div>
    </div>
  );
}
