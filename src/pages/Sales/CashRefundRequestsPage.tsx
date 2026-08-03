import { useNavigate } from 'react-router-dom';
import { HandCoins, Check, X } from 'lucide-react';
import { useCashRefundRequests } from '@/hooks/useReplacementAndRefunds';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';

export function CashRefundRequestsPage() {
  const { requests, loading, decide } = useCashRefundRequests();
  const { push } = useToast();
  const navigate = useNavigate();

  const handleDecide = async (id: string, approve: boolean) => {
    if (approve && !confirm('Approve this cash refund request? This records approval only — the actual disbursement still happens outside the system.')) return;
    const { error } = await decide(id, approve);
    if (error) { push('error', error); return; }
    push('success', approve ? 'Refund request approved.' : 'Refund request rejected.');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-slate-100">
          <HandCoins size={20} /> Cash Refund Requests
        </h1>
        <p className="text-sm text-slate-500">Requests for a cash refund on an accepted return, instead of credit or replacement.</p>
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
            {!loading && requests.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-slate-400">No pending cash refund requests.</td></tr>}
            {requests.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800">
                <td className="p-3">
                  <button className="font-medium text-blue-600 hover:underline dark:text-blue-400" onClick={() => navigate(`/sales/returns/${r.return_id}`)}>
                    {r.return?.return_number ?? r.return_id}
                  </button>
                </td>
                <td className="p-3">{r.customer?.customer_code} — {r.customer?.business_name}</td>
                <td className="p-3">{r.requested_amount.toFixed(2)}</td>
                <td className="p-3">{r.reason ?? '—'}</td>
                <td className="p-3">{new Date(r.created_at).toLocaleString()}</td>
                <td className="p-3 text-right">
                  <div className="flex justify-end gap-2">
                    <PermissionGate permission="sales_returns:approve_return">
                      <button className="btn-secondary !py-1 text-xs text-green-600" onClick={() => handleDecide(r.id, true)}><Check size={12} /> Approve</button>
                    </PermissionGate>
                    <PermissionGate permission="sales_returns:approve_return">
                      <button className="btn-secondary !py-1 text-xs text-red-600" onClick={() => handleDecide(r.id, false)}><X size={12} /> Reject</button>
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
