import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Undo2, Check, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';

interface ReversalQueueRow {
  id: string;
  return_id: string;
  reason: string;
  request_date: string;
  return?: { return_number: string; net_return_amount: number; customer?: { business_name: string } | null } | null;
}

function useReturnReversalQueue() {
  const { company } = useAuth();
  const [requests, setRequests] = useState<ReversalQueueRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data } = await supabase
      .from('sales_return_reversal_requests')
      .select('*, return:sales_returns(return_number, net_return_amount, customer:customers(business_name))')
      .eq('company_id', company.id)
      .eq('approval_status', 'pending')
      .order('request_date');
    setRequests((data ?? []) as unknown as ReversalQueueRow[]);
    setLoading(false);
  }, [company]);

  useEffect(() => { load(); }, [load]);

  const decide = useCallback(async (requestId: string, approve: boolean, reason?: string) => {
    const { data, error } = await supabase.rpc('execute_return_reversal', { p_reversal_request_id: requestId, p_approve: approve, p_decision_reason: reason ?? null });
    if (error) return { error: error.message };
    await load();
    return { data };
  }, [load]);

  return { requests, loading, decide };
}

export function ReturnReversalQueuePage() {
  const { requests, loading, decide } = useReturnReversalQueue();
  const { push } = useToast();
  const navigate = useNavigate();

  const handleApprove = async (id: string) => {
    if (!confirm('Approve this reversal? Any restocked saleable quantity will be removed from inventory, the customer credit will be reversed, and any credit note will be cancelled. This cannot be undone.')) return;
    const { error, data } = await decide(id, true);
    if (error) { push('error', error); return; }
    push('success', `Reversal approved — ${(data as any)?.stock_movements_reversed ?? 0} stock movement(s) reversed.`);
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
          <Undo2 size={20} /> Return Reversal Requests
        </h1>
        <p className="text-sm text-slate-500">
          Requests to reverse a posted return. Approving un-restocks saleable quantity, restores the customer's
          balance and the invoice's credited amount, and cancels any credit note or pending replacement.
        </p>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-700">
              <th className="p-3">Return</th><th className="p-3">Customer</th><th className="p-3">Amount</th>
              <th className="p-3">Reason</th><th className="p-3">Requested</th><th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="p-4 text-center text-slate-400">Loading…</td></tr>}
            {!loading && requests.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-slate-400">No pending reversal requests.</td></tr>}
            {requests.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800">
                <td className="p-3">
                  <button className="font-medium text-blue-600 hover:underline dark:text-blue-400" onClick={() => navigate(`/sales/returns/${r.return_id}`)}>
                    {r.return?.return_number ?? r.return_id}
                  </button>
                </td>
                <td className="p-3">{r.return?.customer?.business_name ?? '—'}</td>
                <td className="p-3">{r.return?.net_return_amount?.toFixed(2) ?? '—'}</td>
                <td className="p-3">{r.reason}</td>
                <td className="p-3">{new Date(r.request_date).toLocaleString()}</td>
                <td className="p-3 text-right">
                  <div className="flex justify-end gap-2">
                    <PermissionGate permission="sales_returns:approve_return_reversal">
                      <button className="btn-secondary !py-1 text-xs text-green-600" onClick={() => handleApprove(r.id)}><Check size={12} /> Approve</button>
                    </PermissionGate>
                    <PermissionGate permission="sales_returns:approve_return_reversal">
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
