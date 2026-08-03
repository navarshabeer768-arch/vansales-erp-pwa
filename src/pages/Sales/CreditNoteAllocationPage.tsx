import { useState } from 'react';
import { Receipt } from 'lucide-react';
import { useUnallocatedCreditNotes } from '@/hooks/useReplacementAndRefunds';
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
      <PermissionGate permission="sales_returns:generate_credit_note">
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

export function CreditNoteAllocationPage() {
  const { notes, allocate } = useUnallocatedCreditNotes();
  const { push } = useToast();

  const handleAllocate = async (creditNoteId: string, invoiceId: string, amount: number) => {
    const { error } = await allocate(creditNoteId, invoiceId, amount);
    if (error) { push('error', error); return; }
    push('success', 'Credit note allocated.');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-slate-100">
          <Receipt size={20} /> Credit Note Allocation
        </h1>
        <p className="text-sm text-slate-500">Posted return credit notes, ready to allocate against any of the customer's outstanding invoices.</p>
      </div>

      <div className="space-y-2">
        {notes.map((n) => (
          <div key={n.id} className="card p-3 text-sm">
            <div className="flex items-center justify-between">
              <p className="font-medium">{n.credit_note_number} — {n.customer?.customer_code} {n.customer?.business_name}</p>
              <span className="font-bold">{n.approved_credit_amount.toFixed(2)}</span>
            </div>
            <AllocateRow customerId={n.customer_id} onAllocate={(invoiceId, amount) => handleAllocate(n.id, invoiceId, amount)} />
          </div>
        ))}
        {notes.length === 0 && <p className="text-sm text-slate-500">No unallocated return credit notes.</p>}
      </div>
    </div>
  );
}
