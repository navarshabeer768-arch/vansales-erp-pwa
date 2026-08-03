import { useNavigate } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { useReplacementOrders } from '@/hooks/useReplacementAndRefunds';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';

const STATUS_STYLES: Record<string, string> = {
  requested: 'bg-slate-100 text-slate-600 dark:bg-slate-800',
  pending_approval: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30',
  approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30',
  waiting_for_stock: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30',
  ready: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30',
  partially_issued: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30',
  issued: 'bg-cyan-200 text-cyan-800 dark:bg-cyan-900/50',
};

export function ReplacementOrdersPage() {
  const { orders, loading, processAction } = useReplacementOrders();
  const { push } = useToast();
  const navigate = useNavigate();

  const handleAction = async (orderId: string, action: string) => {
    if (action === 'reject' && !confirm('Reject this replacement order?')) return;
    const { error } = await processAction(orderId, action);
    if (error) { push('error', error); return; }
    push('success', 'Updated.');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-slate-100">
          <RefreshCw size={20} /> Replacement Orders
        </h1>
        <p className="text-sm text-slate-500">Replacement orders created from accepted return items — their own record type, not a free Sales Order.</p>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-700">
              <th className="p-3">Return</th><th className="p-3">Customer</th><th className="p-3">Value Rule</th>
              <th className="p-3">Required Date</th><th className="p-3">Status</th><th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="p-4 text-center text-slate-400">Loading…</td></tr>}
            {!loading && orders.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-slate-400">No active replacement orders.</td></tr>}
            {orders.map((o) => (
              <tr key={o.id} className="border-b border-slate-100 dark:border-slate-800">
                <td className="p-3">
                  <button className="font-medium text-blue-600 hover:underline dark:text-blue-400" onClick={() => navigate(`/sales/returns/${o.return_id}`)}>
                    {o.return?.return_number ?? o.return_id}
                  </button>
                </td>
                <td className="p-3">{o.customer?.customer_code} — {o.customer?.business_name}</td>
                <td className="p-3 capitalize">{o.value_rule.replace(/_/g, ' ')}</td>
                <td className="p-3">{o.required_date ?? '—'}</td>
                <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[o.status] ?? 'bg-slate-100 text-slate-600'}`}>{o.status.replace(/_/g, ' ')}</span></td>
                <td className="p-3 text-right">
                  <div className="flex justify-end gap-2 text-xs">
                    {o.status === 'requested' && (
                      <PermissionGate permission="sales_returns:approve_replacement">
                        <button className="text-green-600 hover:underline" onClick={() => handleAction(o.id, 'approve')}>Approve</button>
                        <button className="text-red-600 hover:underline" onClick={() => handleAction(o.id, 'reject')}>Reject</button>
                      </PermissionGate>
                    )}
                    {o.status === 'approved' && (
                      <PermissionGate permission="sales_returns:approve_replacement">
                        <button className="text-blue-600 hover:underline" onClick={() => handleAction(o.id, 'mark_waiting_for_stock')}>Waiting for Stock</button>
                        <button className="text-teal-600 hover:underline" onClick={() => handleAction(o.id, 'mark_ready')}>Mark Ready</button>
                      </PermissionGate>
                    )}
                    {o.status === 'waiting_for_stock' && (
                      <PermissionGate permission="sales_returns:approve_replacement">
                        <button className="text-teal-600 hover:underline" onClick={() => handleAction(o.id, 'mark_ready')}>Mark Ready</button>
                      </PermissionGate>
                    )}
                    <PermissionGate permission="sales_returns:approve_replacement">
                      <button className="text-red-600 hover:underline" onClick={() => handleAction(o.id, 'cancel')}>Cancel</button>
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
