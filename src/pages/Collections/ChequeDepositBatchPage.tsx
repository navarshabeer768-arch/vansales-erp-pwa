import { useCallback, useEffect, useState } from 'react';
import { Landmark } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';

interface DepositableCheque {
  payment_component_id: string;
  amount: number;
  cheque_number: string;
  cheque_date: string;
  bank_name: string;
  receipt_number: string;
  customer_name: string;
}

function useDepositableCheques() {
  const { company } = useAuth();
  const [cheques, setCheques] = useState<DepositableCheque[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data } = await supabase
      .from('cheque_receipt_details')
      .select('payment_component_id, cheque_number, cheque_date, bank_name, payment_component:receipt_payment_components!inner(amount, receipt:receipt_vouchers(receipt_number, final_receipt_number, customer:customers(business_name)))')
      .eq('company_id', company.id)
      .eq('cheque_status', 'verified');
    setCheques(((data ?? []) as any[]).map((c) => ({
      payment_component_id: c.payment_component_id, amount: c.payment_component?.amount ?? 0,
      cheque_number: c.cheque_number, cheque_date: c.cheque_date, bank_name: c.bank_name,
      receipt_number: c.payment_component?.receipt?.final_receipt_number ?? c.payment_component?.receipt?.receipt_number ?? '—',
      customer_name: c.payment_component?.receipt?.customer?.business_name ?? '—',
    })));
    setLoading(false);
  }, [company]);

  useEffect(() => { load(); }, [load]);

  const createBatch = useCallback(async (bankAccount: string, componentIds: string[], depositSlipNumber?: string) => {
    const { data, error } = await supabase.rpc('create_cheque_deposit_batch', {
      p_bank_account: bankAccount, p_payment_component_ids: componentIds, p_deposit_slip_number: depositSlipNumber ?? null,
    });
    if (error) return { error: error.message };
    await load();
    return { data };
  }, [load]);

  return { cheques, loading, createBatch };
}

export function ChequeDepositBatchPage() {
  const { cheques, loading, createBatch } = useDepositableCheques();
  const { push } = useToast();
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bankAccount, setBankAccount] = useState('');
  const [slipNumber, setSlipNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const selectedIds = Object.entries(selected).filter(([, v]) => v).map(([id]) => id);
  const selectedTotal = cheques.filter((c) => selected[c.payment_component_id]).reduce((sum, c) => sum + c.amount, 0);

  const handleCreateBatch = async () => {
    if (!bankAccount) { push('error', 'Enter a bank account.'); return; }
    if (selectedIds.length === 0) { push('error', 'Select at least one cheque.'); return; }
    setSubmitting(true);
    const { error } = await createBatch(bankAccount, selectedIds, slipNumber || undefined);
    setSubmitting(false);
    if (error) { push('error', error); return; }
    push('success', `Deposit batch created with ${selectedIds.length} cheque(s).`);
    setSelected({}); setSlipNumber('');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-slate-100">
          <Landmark size={20} /> Cheque Deposit Batches
        </h1>
        <p className="text-sm text-slate-500">Group verified cheques into a bank deposit batch.</p>
      </div>

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="label">Bank Account</label>
          <input className="input" value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} placeholder="e.g. QNB Current Account" />
        </div>
        <div>
          <label className="label">Deposit Slip Number</label>
          <input className="input" value={slipNumber} onChange={(e) => setSlipNumber(e.target.value)} />
        </div>
        <PermissionGate permission="receipt_vouchers:deposit_cheque">
          <button className="btn-primary" onClick={handleCreateBatch} disabled={submitting || selectedIds.length === 0}>
            {submitting ? 'Creating…' : `Deposit ${selectedIds.length ? `(${selectedIds.length}, ${selectedTotal.toFixed(2)})` : ''}`}
          </button>
        </PermissionGate>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-700">
              <th className="p-3"></th><th className="p-3">Cheque #</th><th className="p-3">Bank</th>
              <th className="p-3">Cheque Date</th><th className="p-3">Amount</th><th className="p-3">Receipt</th><th className="p-3">Customer</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="p-4 text-center text-slate-400">Loading…</td></tr>}
            {!loading && cheques.length === 0 && <tr><td colSpan={7} className="p-4 text-center text-slate-400">No verified cheques awaiting deposit.</td></tr>}
            {cheques.map((c) => (
              <tr key={c.payment_component_id} className="border-b border-slate-100 dark:border-slate-800">
                <td className="p-3">
                  <input type="checkbox" checked={!!selected[c.payment_component_id]} onChange={(e) => setSelected((prev) => ({ ...prev, [c.payment_component_id]: e.target.checked }))} />
                </td>
                <td className="p-3">{c.cheque_number}</td>
                <td className="p-3">{c.bank_name}</td>
                <td className="p-3">{c.cheque_date}</td>
                <td className="p-3">{c.amount.toFixed(2)}</td>
                <td className="p-3">{c.receipt_number}</td>
                <td className="p-3">{c.customer_name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
