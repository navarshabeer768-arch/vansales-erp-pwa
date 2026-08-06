import { useState } from 'react';
import { Landmark } from 'lucide-react';
import { useCreditNoteUnallocatedCredits } from '@/hooks/useAdjustmentReversalAndAllocation';
import { useCustomerOutstandingInvoices } from '@/hooks/useCustomerOutstanding';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';

function AllocateRow({ customerId, onAllocate }: { customerId: string; onAllocate: (invoiceId: string, amount: number) => void }) {
  const { invoices, loading } = useCustomerOutstandingInvoices(customerId);
  const [invoiceId, setInvoiceId] = useState('');
  const [amount, setAmount] = useState('');

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <select className="input !w-auto" value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} disabled={loading}>
        <option value="">{loading ? 'Loading invoices…' : 'Select invoice…'}</option>
        {invoices.map((inv) => <option key={inv.invoice_id} value={inv.invoice_id}>{inv.invoice_number} — outstanding {inv.outstanding_amount.toFixed(2)}</option>)}
      </select>
      <input type="number" className="input !w-28" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <PermissionGate permission="financial_adjustments:allocate_credits">
        <button
          className="btn-primary !py-1.5 text-sm"
          disabled={!invoiceId || !amount}
          onClick={() => { onAllocate(invoiceId, Number(amount)); setInvoiceId(''); setAmount(''); }}
        >
          Allocate
        </button>
      </PermissionGate>
    </div>
  );
}

export function CreditNoteUnallocatedCreditPage() {
  const { credits, allocate } = useCreditNoteUnallocatedCredits();
  const { push } = useToast();

  const handleAllocate = async (unallocatedId: string, invoiceId: string, amount: number) => {
    const { error } = await allocate(unallocatedId, invoiceId, amount);
    if (error) { push('error', error); return; }
    push('success', 'Credit allocated.');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-slate-100">
          <Landmark size={20} /> Credit Note Allocation
        </h1>
        <p className="text-sm text-slate-500">
          Leftover credit from posted credit notes that wasn't fully applied to their original invoice — ready to
          allocate against any of the customer's outstanding invoices.
        </p>
      </div>

      <div className="space-y-2">
        {credits.map((c) => (
          <div key={c.id} className="card p-3 text-sm">
            <div className="flex items-center justify-between">
              <p className="font-medium">{c.customer?.customer_code} — {c.customer?.business_name}</p>
              <span className="font-bold">{c.available_amount.toFixed(2)}</span>
            </div>
            <p className="text-xs text-slate-500">From credit note {c.credit_note?.document_number ?? c.credit_note_id}{c.reason && ` · ${c.reason}`}</p>
            <AllocateRow customerId={c.customer_id} onAllocate={(invoiceId, amount) => handleAllocate(c.id, invoiceId, amount)} />
          </div>
        ))}
        {credits.length === 0 && <p className="text-sm text-slate-500">No unallocated credit from credit notes.</p>}
      </div>
    </div>
  );
}
