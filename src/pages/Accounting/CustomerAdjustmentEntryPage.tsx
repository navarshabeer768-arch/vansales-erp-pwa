import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SlidersHorizontal } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useCustomers } from '@/hooks/useCustomers';
import { useCustomerInvoicesForReturn } from '@/hooks/useInvoiceReturnable';
import { useInvoiceItemsForAdjustment, useCreateCustomerAdjustment, CustomerAdjustmentItemInput } from '@/hooks/useCustomerAdjustments';
import { useFinancialAdjustmentCatalogs } from '@/hooks/useFinancialAdjustmentCatalogs';
import { useToast } from '@/contexts/ToastContext';

type CorrectionType = 'price' | 'quantity' | 'discount' | 'tax' | 'amount';

interface LineState {
  correctionType: CorrectionType;
  correctedValue: string;
}

export function CustomerAdjustmentEntryPage() {
  const navigate = useNavigate();
  const { push } = useToast();
  const { customers } = useCustomers();
  const { documentTypesFor, reasonsFor } = useFinancialAdjustmentCatalogs();
  const { submit, submitting } = useCreateCustomerAdjustment();

  const [customerId, setCustomerId] = useState('');
  const [documentTypeCode, setDocumentTypeCode] = useState('price_correction');
  const [invoiceId, setInvoiceId] = useState('');
  const [reasonCode, setReasonCode] = useState('pricing_error');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [lines, setLines] = useState<Record<string, LineState>>({});

  const docTypes = documentTypesFor('customer_adjustment');
  const reasons = reasonsFor('customer_adjustment');
  const { invoices } = useCustomerInvoicesForReturn(customerId || undefined);
  const { items: invoiceItems, loading: itemsLoading } = useInvoiceItemsForAdjustment(invoiceId || undefined);

  const toggleLine = (invoiceItemId: string, checked: boolean, defaultType: CorrectionType) => {
    setLines((prev) => {
      const next = { ...prev };
      if (checked) next[invoiceItemId] = { correctionType: defaultType, correctedValue: '' };
      else delete next[invoiceItemId];
      return next;
    });
  };

  const updateLine = (invoiceItemId: string, patch: Partial<LineState>) => {
    setLines((prev) => ({ ...prev, [invoiceItemId]: { ...prev[invoiceItemId], ...patch } }));
  };

  const handleSave = async (submitAfter: boolean) => {
    if (!customerId) { push('error', 'Select a customer.'); return; }
    if (!invoiceId) { push('error', 'Select an invoice — customer adjustments are always invoice-anchored.'); return; }
    const lineEntries = Object.entries(lines).filter(([, v]) => v.correctedValue !== '');
    if (lineEntries.length === 0) { push('error', 'Select at least one item and enter a corrected value.'); return; }

    const items: CustomerAdjustmentItemInput[] = lineEntries.map(([invoiceItemId, v]) => {
      const base: CustomerAdjustmentItemInput = { invoice_item_id: invoiceItemId, reason_code: reasonCode };
      const value = Number(v.correctedValue);
      if (v.correctionType === 'price') base.corrected_price = value;
      else if (v.correctionType === 'quantity') base.corrected_quantity = value;
      else if (v.correctionType === 'discount') base.corrected_discount = value;
      else if (v.correctionType === 'tax') base.corrected_tax = value;
      else base.adjustment_amount = value;
      return base;
    });

    const { data, error } = await submit({
      documentTypeCode, customerId, originalInvoiceId: invoiceId, items, reasonCode,
      referenceNumber: referenceNumber || undefined, internalNotes: internalNotes || undefined, customerNotes: customerNotes || undefined,
      isOffline: !navigator.onLine,
    });
    if (error) { push('error', error); return; }
    if (submitAfter && data) {
      await supabase.rpc('change_customer_adjustment_status', { p_id: data, p_new_status: 'submitted' });
    }
    push('success', submitAfter ? 'Adjustment submitted.' : 'Adjustment saved as draft.');
    if (data) navigate(`/accounting/customer-adjustments/${data}`);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-8">
      <h1 className="flex items-center gap-2 text-lg font-bold text-slate-800 dark:text-slate-100">
        <SlidersHorizontal size={20} /> New Customer Adjustment
      </h1>

      <div className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">Customer</label>
          <select className="input" value={customerId} onChange={(e) => { setCustomerId(e.target.value); setInvoiceId(''); setLines({}); }}>
            <option value="">Select customer…</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.customer_code} — {c.business_name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Adjustment Type</label>
          <select className="input" value={documentTypeCode} onChange={(e) => setDocumentTypeCode(e.target.value)}>
            {docTypes.map((t) => <option key={t.id} value={t.code}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Reason</label>
          <select className="input" value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
            {reasons.map((r) => <option key={r.id} value={r.code}>{r.label}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label">Invoice (required)</label>
          <select className="input" value={invoiceId} onChange={(e) => { setInvoiceId(e.target.value); setLines({}); }} disabled={!customerId}>
            <option value="">Select invoice…</option>
            {invoices.map((inv) => <option key={inv.id} value={inv.id}>{inv.final_invoice_number ?? inv.invoice_number} — {inv.invoice_date} — {inv.net_amount.toFixed(2)}</option>)}
          </select>
        </div>
      </div>

      {invoiceId && (
        <div className="card p-4">
          <h3 className="mb-2 font-semibold">Invoice Items</h3>
          {itemsLoading && <p className="text-sm text-slate-500">Loading…</p>}
          <div className="space-y-2">
            {invoiceItems.map((item) => {
              const line = lines[item.invoice_item_id];
              return (
                <div key={item.invoice_item_id} className="rounded-lg border border-slate-100 p-3 dark:border-slate-800">
                  <label className="flex items-center gap-2 py-1">
                    <input type="checkbox" className="h-5 w-5" checked={!!line} onChange={(e) => toggleLine(item.invoice_item_id, e.target.checked, 'price')} />
                    <span className="font-medium">{item.product_name}</span>
                    <span className="text-xs text-slate-500">Invoiced: {item.unit_price.toFixed(2)} × {item.base_quantity}, discount {item.discount_amount.toFixed(2)}, tax {item.tax_amount.toFixed(2)}</span>
                  </label>
                  {line && (
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      <select className="input" value={line.correctionType} onChange={(e) => updateLine(item.invoice_item_id, { correctionType: e.target.value as CorrectionType, correctedValue: '' })}>
                        <option value="price">Correct Price</option>
                        <option value="quantity">Correct Quantity</option>
                        <option value="discount">Correct Discount</option>
                        <option value="tax">Correct Tax</option>
                        <option value="amount">Direct Amount</option>
                      </select>
                      <input
                        type="number" inputMode="decimal" className="input"
                        placeholder={line.correctionType === 'price' ? 'Corrected price' : line.correctionType === 'quantity' ? 'Corrected quantity' : line.correctionType === 'discount' ? 'Corrected discount' : line.correctionType === 'tax' ? 'Corrected tax' : 'Adjustment amount'}
                        value={line.correctedValue} onChange={(e) => updateLine(item.invoice_item_id, { correctedValue: e.target.value })}
                      />
                    </div>
                  )}
                </div>
              );
            })}
            {invoiceItems.length === 0 && !itemsLoading && <p className="text-sm text-slate-500">No items on this invoice.</p>}
          </div>
        </div>
      )}

      <div className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
        <div>
          <label className="label">Reference Number</label>
          <input className="input" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} />
        </div>
        <div>
          <label className="label">Customer Notes</label>
          <input className="input" value={customerNotes} onChange={(e) => setCustomerNotes(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Internal Notes</label>
          <input className="input" value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} />
        </div>
      </div>

      <div className="sticky bottom-0 card flex items-center justify-end gap-2 p-4">
        <button className="btn-secondary" onClick={() => handleSave(false)} disabled={submitting}>Save Draft</button>
        <button className="btn-primary" onClick={() => handleSave(true)} disabled={submitting}>Submit</button>
      </div>
    </div>
  );
}
