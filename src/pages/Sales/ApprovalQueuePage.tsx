import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Check, X } from 'lucide-react';
import { useApprovalQueue } from '@/hooks/useOrderApprovals';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';

export function ApprovalQueuePage() {
  const { steps, loading, processAction } = useApprovalQueue();
  const { push } = useToast();
  const navigate = useNavigate();

  const handleApprove = async (stepId: string) => {
    const { error } = await processAction(stepId, 'approve');
    if (error) push('error', error); else push('success', 'Approved.');
  };

  const handleReject = async (stepId: string) => {
    const reason = prompt('Reason for rejection:');
    if (!reason) return;
    const { error } = await processAction(stepId, 'reject', reason);
    if (error) push('error', error); else push('success', 'Rejected.');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-slate-100">
          <ShieldCheck size={20} /> Approval Queue
        </h1>
        <p className="text-sm text-slate-500">Every pending order approval step across the company, oldest first.</p>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-700">
              <th className="p-3">Order</th>
              <th className="p-3">Customer</th>
              <th className="p-3">Trigger</th>
              <th className="p-3">Required Role</th>
              <th className="p-3">Amount</th>
              <th className="p-3">Requested</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="p-4 text-center text-slate-400">Loading…</td></tr>}
            {!loading && steps.length === 0 && (
              <tr><td colSpan={7} className="p-4 text-center text-slate-400">Nothing pending approval.</td></tr>
            )}
            {steps.map((s) => (
              <tr key={s.id} className="border-b border-slate-100 dark:border-slate-800">
                <td className="p-3">
                  <button className="font-medium text-blue-600 hover:underline dark:text-blue-400" onClick={() => navigate(`/sales/orders/${s.order?.id}`)}>
                    {s.order?.order_number ?? '—'}
                  </button>
                </td>
                <td className="p-3">{s.order?.customer?.business_name ?? '—'}</td>
                <td className="p-3 capitalize">{s.approval_type.replace(/_/g, ' ')}</td>
                <td className="p-3 capitalize">{s.required_role?.replace(/_/g, ' ') ?? '—'}</td>
                <td className="p-3">{s.order?.net_amount?.toFixed(2) ?? '—'}</td>
                <td className="p-3">{new Date(s.request_time).toLocaleString()}</td>
                <td className="p-3 text-right">
                  <div className="flex justify-end gap-2">
                    <PermissionGate permission="sales_orders:approve_order">
                      <button className="btn-secondary !py-1 text-xs text-green-600" onClick={() => handleApprove(s.id)}>
                        <Check size={12} className="inline" /> Approve
                      </button>
                    </PermissionGate>
                    <PermissionGate permission="sales_orders:reject_order">
                      <button className="btn-secondary !py-1 text-xs text-red-600" onClick={() => handleReject(s.id)}>
                        <X size={12} className="inline" /> Reject
                      </button>
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
