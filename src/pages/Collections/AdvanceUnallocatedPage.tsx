import { useState } from 'react';
import { Wallet } from 'lucide-react';
import { useAdvanceAndUnallocatedBalances } from '@/hooks/useAdvanceAndUnallocated';
import { useCustomerOutstandingInvoices } from '@/hooks/useCustomerOutstanding';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';

function AllocateRow({ customerId, balance, onAllocate }: { customerId: string; balance: number; onAllocate: (invoiceId: string, amount: number) => void }) {
  const { invoices, loading } = useCustomerOutstandingInvoices(customerId);
  const [invoiceId, setInvoiceId] = useState('');
  const [amount, setAmount] = useState('');

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <select className="input !w-auto" value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} disabled={loading}>
        <option value="">{loading ? 'Loading invoices…' : 'Select invoice…'}</option>
        {invoices.map((inv) => <option key={inv.invoice_id} value={inv.invoice_id}>{inv.invoice_number} — outstanding {inv.outstanding_amount.toFixed(2)}</option>)}
      </select>
      <input type="number" className="input !w-28" placeholder="Amount" max={balance} value={amount} onChange={(e) => setAmount(e.target.value)} />
      <PermissionGate permission="receipt_vouchers:allocate_advance">
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

export function AdvanceUnallocatedPage() {
  const { advances, unallocated, allocateAdvance, allocateUnallocated } = useAdvanceAndUnallocatedBalances();
  const { push } = useToast();

  const handleAllocateAdvance = async (advanceId: string, invoiceId: string, amount: number) => {
    const { error } = await allocateAdvance(advanceId, invoiceId, amount);
    if (error) { push('error', error); return; }
    push('success', 'Advance allocated.');
  };

  const handleAllocateUnallocated = async (unallocatedId: string, invoiceId: string, amount: number) => {
    const { error } = await allocateUnallocated(unallocatedId, invoiceId, amount);
    if (error) { push('error', error); return; }
    push('success', 'Unallocated credit allocated.');
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-slate-100">
          <Wallet size={20} /> Advance & Unallocated Credit
        </h1>
        <p className="text-sm text-slate-500">Available customer balances from posted receipts, ready to allocate to any of their outstanding invoices.</p>
      </div>

      <div>
        <h2 className="mb-2 font-semibold">Advance Payments</h2>
        <div className="space-y-2">
          {advances.map((a) => (
            <div key={a.id} className="card p-3 text-sm">
              <div className="flex items-center justify-between">
                <p className="font-medium">{a.customer?.customer_code} — {a.customer?.business_name}</p>
                <span className="capitalize text-slate-500">{a.status.replace(/_/g, ' ')}</span>
              </div>
              <p className="text-xs text-slate-500">
                Receipt {a.receipt?.final_receipt_number ?? a.receipt?.receipt_number} · Original {a.original_amount.toFixed(2)} · Available {a.available_amount.toFixed(2)}
              </p>
              <AllocateRow customerId={a.customer_id} balance={a.available_amount} onAllocate={(invoiceId, amount) => handleAllocateAdvance(a.id, invoiceId, amount)} />
            </div>
          ))}
          {advances.length === 0 && <p className="text-sm text-slate-500">No available advance balances.</p>}
        </div>
      </div>

      <div>
        <h2 className="mb-2 font-semibold">Unallocated Credits</h2>
        <div className="space-y-2">
          {unallocated.map((u) => (
            <div key={u.id} className="card p-3 text-sm">
              <div className="flex items-center justify-between">
                <p className="font-medium">{u.customer?.customer_code} — {u.customer?.business_name}</p>
                <span className="capitalize text-slate-500">{u.status.replace(/_/g, ' ')}</span>
              </div>
              <p className="text-xs text-slate-500">
                Receipt {u.receipt?.final_receipt_number ?? u.receipt?.receipt_number} · Original {u.original_amount.toFixed(2)} · Available {u.available_amount.toFixed(2)}
                {u.reason && ` · ${u.reason}`}
              </p>
              <AllocateRow customerId={u.customer_id} balance={u.available_amount} onAllocate={(invoiceId, amount) => handleAllocateUnallocated(u.id, invoiceId, amount)} />
            </div>
          ))}
          {unallocated.length === 0 && <p className="text-sm text-slate-500">No available unallocated credits.</p>}
        </div>
      </div>
    </div>
  );
}
