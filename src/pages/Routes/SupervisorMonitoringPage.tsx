import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Eye, Radar } from 'lucide-react';
import { useRouteMonitoring } from '@/hooks/useRouteMonitoring';

const STATUS_GROUP_LABELS: Record<string, string> = {
  draft: 'Not Generated', generated: 'Not Generated', pending_approval: 'Pending Approval',
  approved: 'Ready', ready: 'Ready', started: 'In Progress', paused: 'Paused',
  completed: 'Completed', partially_completed: 'Partially Completed', cancelled: 'Cancelled', closed: 'Closed',
};

function SummaryCard({ label, count }: { label: string; count: number }) {
  return (
    <div className="card p-3 text-center">
      <p className="text-2xl font-bold">{count}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

export function SupervisorMonitoringPage() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const { routes, loading, reload } = useRouteMonitoring(date);
  const navigate = useNavigate();

  const grouped: Record<string, number> = {};
  for (const r of routes) {
    const label = STATUS_GROUP_LABELS[r.status] ?? r.status;
    grouped[label] = (grouped[label] ?? 0) + 1;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-slate-100">
            <Radar size={20} /> Supervisor Live Monitoring
          </h1>
          <p className="text-sm text-slate-500">Real-time route status across all vans for the selected date.</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          <button className="btn-secondary" onClick={reload} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {['Not Generated', 'Pending Approval', 'Ready', 'In Progress', 'Paused', 'Completed', 'Partially Completed'].map((label) => (
          <SummaryCard key={label} label={label} count={grouped[label] ?? 0} />
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-700">
              <th className="p-3">Route / Beat</th>
              <th className="p-3">Van</th>
              <th className="p-3">Employee</th>
              <th className="p-3">Started</th>
              <th className="p-3">Progress</th>
              <th className="p-3">Pending</th>
              <th className="p-3">Missed</th>
              <th className="p-3">Status</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={9} className="p-4 text-center text-slate-400">Loading…</td></tr>}
            {!loading && routes.length === 0 && (
              <tr><td colSpan={9} className="p-4 text-center text-slate-400">No routes for this date.</td></tr>
            )}
            {routes.map((r) => (
              <tr key={r.plan_id} className="border-b border-slate-100 dark:border-slate-800">
                <td className="p-3">{r.beat_name ?? r.route_name ?? '—'}</td>
                <td className="p-3">{r.van_name ?? '—'}</td>
                <td className="p-3">{r.primary_employee_name ?? '—'}</td>
                <td className="p-3">{r.start_time ? new Date(r.start_time).toLocaleTimeString() : '—'}</td>
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div className="h-full bg-blue-600" style={{ width: `${r.completion_pct}%` }} />
                    </div>
                    <span className="text-xs">{r.completion_pct}%</span>
                  </div>
                </td>
                <td className="p-3">{r.pending}</td>
                <td className="p-3 text-red-600">{r.missed}</td>
                <td className="p-3 capitalize">{STATUS_GROUP_LABELS[r.status] ?? r.status}</td>
                <td className="p-3 text-right">
                  <button className="text-xs text-blue-600 hover:underline" onClick={() => navigate(`/routes/daily-plans/${r.plan_id}`)}>
                    <Eye size={12} className="inline" /> View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
