import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, Sparkles, Check, X } from 'lucide-react';
import { useDailyVisitPlans, DailyPlanStatus } from '@/hooks/useDailyVisitPlans';
import { useBeatPlans } from '@/hooks/useBeatPlans';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';

const STATUS_STYLES: Record<DailyPlanStatus, string> = {
  draft: 'bg-slate-100 text-slate-600 dark:bg-slate-800',
  generated: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30',
  pending_approval: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30',
  approved: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30',
  ready: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30',
  started: 'bg-green-100 text-green-700 dark:bg-green-900/30',
  paused: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30',
  completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30',
  partially_completed: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30',
  closed: 'bg-slate-200 text-slate-500 dark:bg-slate-700',
};

export function DailyVisitPlansPage() {
  const [planDate, setPlanDate] = useState(new Date().toISOString().slice(0, 10));
  const { plans, loading, generatePlan, submitForApproval, decidePlan, reload } = useDailyVisitPlans(planDate, planDate);
  const { beatPlans } = useBeatPlans();
  const activeBeatPlans = beatPlans.filter((bp) => bp.status === 'active');
  const [selectedBeatPlanId, setSelectedBeatPlanId] = useState('');
  const { push } = useToast();
  const navigate = useNavigate();

  const handleGenerate = async () => {
    if (!selectedBeatPlanId) { push('error', 'Select a beat plan first.'); return; }
    const { data, error } = await generatePlan(selectedBeatPlanId, planDate);
    if (error) { push('error', error); return; }
    push('success', 'Daily visit plan generated.');
    if (data) navigate(`/routes/daily-plans/${data}`);
  };

  const handleSubmit = async (id: string) => {
    const { error } = await submitForApproval(id);
    if (error) push('error', error); else push('success', 'Submitted for approval.');
  };

  const handleDecide = async (id: string, approve: boolean) => {
    const reason = approve ? undefined : (prompt('Reason for rejection:') ?? undefined);
    const { error } = await decidePlan(id, approve, reason);
    if (error) push('error', error); else push('success', approve ? 'Plan approved.' : 'Plan rejected.');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-slate-100">
          <CalendarDays size={20} /> Daily Visit Plans
        </h1>
        <p className="text-sm text-slate-500">Generated from active Beat Plans, or created manually.</p>
      </div>

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="label">Plan Date</label>
          <input type="date" className="input" value={planDate} onChange={(e) => setPlanDate(e.target.value)} />
        </div>
        <PermissionGate permission="route_execution:generate_plans">
          <div className="flex-1 min-w-[220px]">
            <label className="label">Generate from Beat Plan</label>
            <select className="input" value={selectedBeatPlanId} onChange={(e) => setSelectedBeatPlanId(e.target.value)}>
              <option value="">Select an active beat plan…</option>
              {activeBeatPlans.map((bp) => <option key={bp.id} value={bp.id}>{bp.beat_code} — {bp.beat_name}</option>)}
            </select>
          </div>
          <button className="btn-primary" onClick={handleGenerate}>
            <Sparkles size={16} /> Generate Plan
          </button>
        </PermissionGate>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-700">
              <th className="p-3">Beat Plan</th>
              <th className="p-3">Route</th>
              <th className="p-3">Van</th>
              <th className="p-3">Status</th>
              <th className="p-3">Type</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="p-4 text-center text-slate-400">Loading…</td></tr>}
            {!loading && plans.length === 0 && (
              <tr><td colSpan={6} className="p-4 text-center text-slate-400">No plans for this date yet.</td></tr>
            )}
            {plans.map((p) => (
              <tr key={p.id} className="border-b border-slate-100 dark:border-slate-800">
                <td className="p-3">
                  <button className="font-medium text-blue-600 hover:underline dark:text-blue-400" onClick={() => navigate(`/routes/daily-plans/${p.id}`)}>
                    {p.beat_plan?.beat_name ?? '(manual)'}
                  </button>
                </td>
                <td className="p-3">{p.route?.name ?? '—'}</td>
                <td className="p-3">{p.van?.name ?? '—'}</td>
                <td className="p-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[p.status]}`}>{p.status.replace(/_/g, ' ')}</span>
                </td>
                <td className="p-3 capitalize">{p.generation_type}</td>
                <td className="p-3 text-right">
                  <div className="flex justify-end gap-2">
                    {p.status === 'generated' && (
                      <PermissionGate permission="route_execution:edit_plans">
                        <button className="btn-secondary !py-1 text-xs" onClick={() => handleSubmit(p.id)}>Submit for Approval</button>
                      </PermissionGate>
                    )}
                    {p.status === 'pending_approval' && (
                      <PermissionGate permission="route_execution:approve_plans">
                        <button className="btn-secondary !py-1 text-xs text-green-600" onClick={() => handleDecide(p.id, true)}><Check size={12} className="inline" /> Approve</button>
                        <button className="btn-secondary !py-1 text-xs text-red-600" onClick={() => handleDecide(p.id, false)}><X size={12} className="inline" /> Reject</button>
                      </PermissionGate>
                    )}
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
