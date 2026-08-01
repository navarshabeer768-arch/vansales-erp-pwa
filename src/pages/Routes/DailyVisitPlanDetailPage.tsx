import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Users as UsersIcon, AlertTriangle, RotateCcw } from 'lucide-react';
import { useDailyVisitPlan, useDailyVisitPlanEmployees, useDailyVisitPlans } from '@/hooks/useDailyVisitPlans';
import { useDailyVisitPlanItems } from '@/hooks/useDailyVisitPlanItems';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';

export function DailyVisitPlanDetailPage() {
  const { planId } = useParams();
  const navigate = useNavigate();
  const { plan, loading, reload } = useDailyVisitPlan(planId);
  const { employees } = useDailyVisitPlanEmployees(planId);
  const { items, reorder } = useDailyVisitPlanItems(planId);
  const { changeStatus, reopenPlan } = useDailyVisitPlans();
  const { push } = useToast();

  if (loading || !plan) return <p className="text-center text-slate-400">Loading…</p>;

  const included = items.filter((i) => i.visit_status !== 'not_applicable');
  const excluded = items.filter((i) => i.visit_status === 'not_applicable');

  const markReady = async () => {
    const { error } = await changeStatus(plan.id, 'ready');
    if (error) { push('error', error); return; }
    push('success', 'Plan marked Ready.');
    reload();
  };

  const handleReorder = async (itemId: string, newSeq: number) => {
    const reason = prompt('Reason for changing sequence:') ?? '';
    const { error } = await reorder(itemId, newSeq, reason);
    if (error) push('error', error);
  };

  const handleReopen = async () => {
    const reason = prompt('Reason for reopening this plan:');
    if (!reason) return;
    const { error } = await reopenPlan(plan.id, reason);
    if (error) { push('error', error); return; }
    push('success', 'Plan reopened.');
    reload();
  };

  return (
    <div className="space-y-6">
      <button className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700" onClick={() => navigate('/routes/daily-plans')}>
        <ArrowLeft size={14} /> Back to Daily Visit Plans
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">
            {plan.beat_plan?.beat_name ?? 'Manual Plan'} — {plan.plan_date}
          </h1>
          <p className="text-sm capitalize text-slate-500">{plan.status.replace(/_/g, ' ')} · {plan.route?.name ?? 'No route'} · {plan.van?.name ?? 'No van'}</p>
        </div>
        <div className="flex gap-2">
          {plan.status === 'approved' && (
            <PermissionGate permission="route_execution:edit_plans">
              <button className="btn-secondary" onClick={markReady}>Mark Ready</button>
            </PermissionGate>
          )}
          {plan.status === 'ready' && (
            <PermissionGate permission="route_execution:start_route">
              <button className="btn-primary" onClick={() => navigate(`/routes/execution/${plan.id}`)}>
                <Play size={16} /> Start Route
              </button>
            </PermissionGate>
          )}
          {(plan.status === 'started' || plan.status === 'paused') && (
            <PermissionGate permission="route_execution:start_route">
              <button className="btn-primary" onClick={() => navigate(`/routes/execution/${plan.id}`)}>
                Open Execution Screen
              </button>
            </PermissionGate>
          )}
          {(plan.status === 'completed' || plan.status === 'partially_completed' || plan.status === 'closed') && (
            <PermissionGate permission="route_execution:reopen_plan">
              <button className="btn-secondary" onClick={handleReopen}><RotateCcw size={14} /> Reopen</button>
            </PermissionGate>
          )}
        </div>
      </div>

      <div className="card p-4">
        <h3 className="mb-3 flex items-center gap-2 font-semibold"><UsersIcon size={16} /> Assigned Employees</h3>
        <div className="flex flex-wrap gap-2">
          {employees.map((e) => (
            <span key={e.id} className="rounded-full bg-slate-100 px-3 py-1 text-sm dark:bg-slate-800">
              {e.employee?.full_name} <span className="text-xs capitalize text-slate-500">({e.role_code}{e.is_primary ? ', primary' : ''})</span>
            </span>
          ))}
          {employees.length === 0 && <p className="text-sm text-slate-500">No employees assigned.</p>}
        </div>
      </div>

      <div className="card overflow-x-auto">
        <h3 className="p-4 pb-0 font-semibold">Customer Sequence ({included.length} planned)</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-700">
              <th className="p-3">Seq</th>
              <th className="p-3">Customer</th>
              <th className="p-3">Scheduled Time</th>
              <th className="p-3">Priority</th>
              <th className="p-3">Status</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {included.map((i) => (
              <tr key={i.id} className="border-b border-slate-100 dark:border-slate-800">
                <td className="p-3">{i.sequence}</td>
                <td className="p-3">{i.customer?.customer_code} — {i.customer?.business_name}</td>
                <td className="p-3">{i.scheduled_time ?? '—'}</td>
                <td className="p-3 capitalize">{i.priority}</td>
                <td className="p-3 capitalize">{i.visit_status.replace(/_/g, ' ')}</td>
                <td className="p-3 text-right">
                  {(plan.status === 'draft' || plan.status === 'generated' || plan.status === 'pending_approval' || plan.status === 'approved') && (
                    <PermissionGate permission="route_execution:reorder_customers">
                      <button className="text-xs text-blue-600 hover:underline" onClick={() => {
                        const v = prompt('New sequence number:', String(i.sequence));
                        if (v) handleReorder(i.id, Number(v));
                      }}>Reorder</button>
                    </PermissionGate>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {excluded.length > 0 && (
        <div className="card p-4">
          <h3 className="mb-3 flex items-center gap-2 font-semibold text-amber-600"><AlertTriangle size={16} /> Excluded Customers ({excluded.length})</h3>
          <div className="space-y-1 text-sm">
            {excluded.map((i) => (
              <p key={i.id}>{i.customer?.customer_code} — {i.customer?.business_name}: <span className="text-slate-500">{i.exclusion_reason}</span></p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
