import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FilePlus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useCustomers } from '@/hooks/useCustomers';
import { useCustomerInvoicesForReturn } from '@/hooks/useInvoiceReturnable';
import { useInvoiceItemsForAdjustment } from '@/hooks/useCustomerAdjustments';
import { useFinancialAdjustmentCatalogs } from '@/hooks/useFinancialAdjustmentCatalogs';
import { useCreateDebitNote } from '@/hooks/useDebitNotes';
import type { CreditNoteItemInput } from '@/hooks/useCreditNotes';
import { useToast } from '@/contexts/ToastContext';

export function DebitNoteEntryPage() {
  const navigate = useNavigate();
  const { push } = useToast();
  const { customers } = useCustomers();
  const { documentTypesFor, reasonsFor } = useFinancialAdjustmentCatalogs();
  const { submit, submitting } = useCreateDebitNote();

  const [customerId, setCustomerId] = useState('');
  const [documentTypeCode, setDocumentTypeCode] = useState('manual_debit_note');
  const [entryMode, setEntryMode] = useState<'amount' | 'items'>('amount');
  const [amountValue, setAmountValue] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [reasonCode, setReasonCode] = useState('other');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [selectedItems, setSelectedItems] = useState<Record<string, { correctedAmount: string }>>({});

  const docTypes = documentTypesFor('debit_note');
  const reasons = reasonsFor('debit_note');
  const selectedDocType = docTypes.find((t) => t.code === documentTypeCode);
  const { invoices } = useCustomerInvoicesForReturn(customerId || undefined);
  const { items: invoiceItems } = useInvoiceItemsForAdjustment(entryMode === 'items' ? invoiceId || undefined : undefined);

  const handleSave = async (submitAfter: boolean) => {
    if (!customerId) { push('error', 'Select a customer.'); return; }
    if (selectedDocType?.invoice_required && !invoiceId) { push('error', 'This debit note type requires an invoice.'); return; }

    let items: CreditNoteItemInput[] = [];
    let amountOnlyValue: number | undefined;

    if (entryMode === 'amount') {
      if (!amountValue || Number(amountValue) <= 0) { push('error', 'Enter a debit amount.'); return; }
      amountOnlyValue = Number(amountValue);
    } else {
      items = Object.entries(selectedItems).filter(([, v]) => Number(v.correctedAmount) > 0).map(([invoiceItemId, v]) => ({
        invoice_item_id: invoiceItemId, adjustment_amount: Number(v.correctedAmount), reason_code: reasonCode,
      }));
      if (items.length === 0) { push('error', 'Select at least one item with an amount.'); return; }
    }

    const { data, error } = await submit({
      documentTypeCode, customerId, items, amountOnlyValue,
      originalInvoiceId: invoiceId || null, reasonCode, referenceNumber: referenceNumber || undefined,
      internalNotes: internalNotes || undefined, customerNotes: customerNotes || undefined,
      isOffline: !navigator.onLine,
    });
    if (error) { push('error', error); return; }
    if (submitAfter && data) {
      await supabase.rpc('change_debit_note_status', { p_id: data, p_new_status: 'submitted' });
    }
    push('success', submitAfter ? 'Debit note submitted.' : 'Debit note saved as draft.');
    if (data) navigate(`/accounting/debit-notes/${data}`);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-8">
      <h1 className="flex items-center gap-2 text-lg font-bold text-slate-800 dark:text-slate-100">
        <FilePlus size={20} /> New Debit Note
      </h1>

      <div className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">Customer</label>
          <select className="input" value={customerId} onChange={(e) => { setCustomerId(e.target.value); setInvoiceId(''); }}>
            <option value="">Select customer…</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.customer_code} — {c.business_name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Debit Note Type</label>
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
          <label className="label">Invoice {selectedDocType?.invoice_required ? '(required)' : '(optional)'}</label>
          <select className="input" value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} disabled={!customerId}>
            <option value="">Select invoice…</option>
            {invoices.map((inv) => <option key={inv.id} value={inv.id}>{inv.final_invoice_number ?? inv.invoice_number} — {inv.invoice_date} — {inv.net_amount.toFixed(2)}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label">Entry Mode</label>
          <div className="flex gap-2">
            <button type="button" className={entryMode === 'amount' ? 'btn-primary' : 'btn-secondary'} onClick={() => setEntryMode('amount')}>Amount Only</button>
            <button type="button" className={entryMode === 'items' ? 'btn-primary' : 'btn-secondary'} onClick={() => setEntryMode('items')} disabled={!invoiceId}>By Invoice Item</button>
          </div>
        </div>
      </div>

      {entryMode === 'amount' && (
        <div className="card p-4">
          <label className="label">Debit Amount</label>
          <input type="number" inputMode="decimal" className="input" value={amountValue} onChange={(e) => setAmountValue(e.target.value)} />
        </div>
      )}

      {entryMode === 'items' && invoiceId && (
        <div className="card p-4">
          <h3 className="mb-2 font-semibold">Invoice Items</h3>
          <div className="space-y-2">
            {invoiceItems.map((item) => (
              <div key={item.invoice_item_id} className="rounded-lg border border-slate-100 p-3 dark:border-slate-800">
                <p className="font-medium">{item.product_name}</p>
                <p className="text-xs text-slate-500">Invoiced at {item.unit_price.toFixed(2)} × {item.base_quantity} {item.uom_label}</p>
                <input
                  type="number" inputMode="decimal" className="input mt-2 !h-[40px]" placeholder="Debit amount"
                  value={selectedItems[item.invoice_item_id]?.correctedAmount ?? ''}
                  onChange={(e) => setSelectedItems((prev) => ({ ...prev, [item.invoice_item_id]: { correctedAmount: e.target.value } }))}
                />
              </div>
            ))}
            {invoiceItems.length === 0 && <p className="text-sm text-slate-500">No items on this invoice.</p>}
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
