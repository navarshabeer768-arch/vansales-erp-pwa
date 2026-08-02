import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Undo2, Check, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';

interface ReversalQueueRow {
  id: string;
  receipt_id: string;
  reason: string;
  request_date: string;
  receipt?: { receipt_number: string; receipt_amount: number; customer?: { business_name: string } | null } | null;
}

function useReversalQueue() {
  const { company } = useAuth();
  const [requests, setRequests] = useState<ReversalQueueRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data } = await supabase
      .from('receipt_reversal_requests')
      .select('*, receipt:receipt_vouchers(receipt_number, receipt_amount, customer:customers(business_name))')
      .eq('company_id', company.id)
      .eq('approval_status', 'pending')
      .order('request_date');
    setRequests((data ?? []) as unknown as ReversalQueueRow[]);
    setLoading(false);
  }, [company]);

  useEffect(() => { load(); }, [load]);

  const decide = useCallback(async (requestId: string, approve: boolean, reason?: string) => {
    const { data, error } = await supabase.rpc('execute_receipt_reversal', { p_reversal_request_id: requestId, p_approve: approve, p_decision_reason: reason ?? null });
    if (error) return { error: error.message };
    await load();
    return { data };
  }, [load]);

  return { requests, loading, decide };
}

export function ReversalQueuePage() {
  const { requests, loading, decide } = useReversalQueue();
  const { push } = useToast();
  const navigate = useNavigate();

  const handleApprove = async (id: string) => {
    if (!confirm('Approve this reversal? Every invoice this receipt settled will be reopened and the customer balance restored. This cannot be undone.')) return;
    const { error, data } = await decide(id, true);
    if (error) { push('error', error); return; }
    push('success', `Reversal approved — ${(data as any)?.invoices_reopened ?? 0} invoice(s) reopened.`);
  };

  const handleReject = async (id: string) => {
    const reason = prompt('Reason for rejecting this reversal request:');
    if (!reason) return;
    const { error } = await decide(id, false, reason);
    if (error) { push('error', error); return; }
    push('success', 'Reversal request rejected.');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-slate-100">
          <Undo2 size={20} /> Reversal Requests
        </h1>
        <p className="text-sm text-slate-500">
          Requests to reverse a posted receipt. Approving reopens every invoice it settled, restores the customer
          balance, and writes an offsetting ledger entry — the original posting records are preserved, not deleted.
        </p>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-700">
              <th className="p-3">Receipt</th><th className="p-3">Customer</th><th className="p-3">Amount</th>
              <th className="p-3">Reason</th><th className="p-3">Requested</th><th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="p-4 text-center text-slate-400">Loading…</td></tr>}
            {!loading && requests.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-slate-400">No pending reversal requests.</td></tr>}
            {requests.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800">
                <td className="p-3">
                  <button className="font-medium text-blue-600 hover:underline dark:text-blue-400" onClick={() => navigate(`/collections/receipts/${r.receipt_id}`)}>
                    {r.receipt?.receipt_number ?? r.receipt_id}
                  </button>
                </td>
                <td className="p-3">{r.receipt?.customer?.business_name ?? '—'}</td>
                <td className="p-3">{r.receipt?.receipt_amount?.toFixed(2) ?? '—'}</td>
                <td className="p-3">{r.reason}</td>
                <td className="p-3">{new Date(r.request_date).toLocaleString()}</td>
                <td className="p-3 text-right">
                  <div className="flex justify-end gap-2">
                    <PermissionGate permission="receipt_vouchers:approve_reversal">
                      <button className="btn-secondary !py-1 text-xs text-green-600" onClick={() => handleApprove(r.id)}><Check size={12} /> Approve</button>
                    </PermissionGate>
                    <PermissionGate permission="receipt_vouchers:approve_reversal">
                      <button className="btn-secondary !py-1 text-xs text-red-600" onClick={() => handleReject(r.id)}><X size={12} /> Reject</button>
                    </PermissionGate>
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
