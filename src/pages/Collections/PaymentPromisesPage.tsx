import { useState } from 'react';
import { HandCoins, Check, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { usePaymentPromises } from '@/hooks/usePaymentPromises';
import { useCustomers } from '@/hooks/useCustomers';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';

export function PaymentPromisesPage() {
  const { promises, loading, updateStatus, reload } = usePaymentPromises();
  const { customers } = useCustomers();
  const { push } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [amount, setAmount] = useState('');
  const [promiseDate, setPromiseDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async () => {
    if (!customerId || !amount || !promiseDate) { push('error', 'Customer, amount, and promise date are required.'); return; }
    setSubmitting(true);
    const { error } = await supabase.rpc('create_payment_promise', {
      p_customer_id: customerId, p_promised_amount: Number(amount), p_promise_date: promiseDate, p_employee_notes: notes || null,
    });
    setSubmitting(false);
    if (error) { push('error', error.message); return; }
    push('success', 'Payment promise recorded.');
    setCustomerId(''); setAmount(''); setNotes(''); setFormOpen(false);
    reload();
  };

  const overdue = (d: string) => new Date(d) < new Date(new Date().toDateString());

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-slate-100">
            <HandCoins size={20} /> Payment Promises
          </h1>
          <p className="text-sm text-slate-500">Open promises for when no payment was collected on a visit — not a receipt voucher.</p>
        </div>
        <PermissionGate permission="receipt_vouchers:create_payment_promise">
          <button className="btn-primary" onClick={() => setFormOpen((v) => !v)}>{formOpen ? 'Cancel' : 'New Promise'}</button>
        </PermissionGate>
      </div>

      {formOpen && (
        <div className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
          <div>
            <label className="label">Customer</label>
            <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Select customer…</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.customer_code} — {c.business_name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Promised Amount</label>
            <input type="number" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <label className="label">Promise Date</label>
            <input type="date" className="input" value={promiseDate} onChange={(e) => setPromiseDate(e.target.value)} />
          </div>
          <div>
            <label className="label">Notes</label>
            <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <button className="btn-primary" onClick={handleCreate} disabled={submitting}>{submitting ? 'Saving…' : 'Save Promise'}</button>
          </div>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-700">
              <th className="p-3">Customer</th><th className="p-3">Promised Amount</th><th className="p-3">Promise Date</th>
              <th className="p-3">Method Expected</th><th className="p-3">Notes</th><th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="p-4 text-center text-slate-400">Loading…</td></tr>}
            {!loading && promises.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-slate-400">No open payment promises.</td></tr>}
            {promises.map((p) => (
              <tr key={p.id} className="border-b border-slate-100 dark:border-slate-800">
                <td className="p-3">{p.customer?.customer_code} — {p.customer?.business_name}</td>
                <td className="p-3">{p.promised_amount.toFixed(2)}</td>
                <td className={`p-3 ${overdue(p.promise_date) ? 'font-medium text-red-600' : ''}`}>{p.promise_date}</td>
                <td className="p-3 capitalize">{p.payment_method_expected?.replace(/_/g, ' ') ?? '—'}</td>
                <td className="p-3 text-xs text-slate-500">{p.employee_notes ?? p.customer_notes ?? '—'}</td>
                <td className="p-3 text-right">
                  <div className="flex justify-end gap-2">
                    <button className="text-xs text-green-600 hover:underline" onClick={() => updateStatus(p.id, 'kept')}><Check size={12} className="inline" /> Kept</button>
                    <button className="text-xs text-red-600 hover:underline" onClick={() => updateStatus(p.id, 'broken')}><X size={12} className="inline" /> Broken</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
