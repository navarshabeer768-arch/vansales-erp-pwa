import { useState } from 'react';
import { FileBarChart } from 'lucide-react';
import { useRouteReports } from '@/hooks/useRouteReports';
import { DataTable, Column } from '@/components/ui/DataTable';
import type {
  BeatPlanMasterRow, DailyVisitPlanReportRow, CustomerVisitOutcomeRow, RoutePauseReportRow, RouteDeviationReportRow,
} from '@/hooks/useRouteReports';

type ReportKey = 'beat_plan_master' | 'daily_visit_plan' | 'pending' | 'missed' | 'skipped' | 'rescheduled' | 'pause' | 'deviation';

const REPORT_OPTIONS: { key: ReportKey; label: string }[] = [
  { key: 'beat_plan_master', label: 'Beat Plan Master Report' },
  { key: 'daily_visit_plan', label: 'Daily Visit Plan Report' },
  { key: 'pending', label: 'Pending Customer Report' },
  { key: 'missed', label: 'Missed Customer Report' },
  { key: 'skipped', label: 'Skipped Customer Report' },
  { key: 'rescheduled', label: 'Rescheduled Customer Report' },
  { key: 'pause', label: 'Route Pause Report' },
  { key: 'deviation', label: 'Route Deviation Report' },
];

export function RouteReportsPage() {
  const [report, setReport] = useState<ReportKey>('beat_plan_master');
  const [dateFrom, setDateFrom] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const {
    beatPlanMaster, dailyPlanReport, pendingCustomers, missedCustomers,
    skippedCustomers, rescheduledCustomers, pauseReport, deviationReport, loading,
  } = useRouteReports(dateFrom, dateTo);

  const beatPlanColumns: Column<BeatPlanMasterRow>[] = [
    { key: 'beat_code', header: 'Code', sortValue: (r) => r.beat_code },
    { key: 'beat_name', header: 'Name', sortValue: (r) => r.beat_name },
    { key: 'area', header: 'Area', render: (r) => r.area ?? '—' },
    { key: 'route_name', header: 'Route', render: (r) => r.route_name ?? '—' },
    { key: 'van_name', header: 'Van', render: (r) => r.van_name ?? '—' },
    { key: 'customer_count', header: 'Customers', sortValue: (r) => r.customer_count },
    { key: 'priority', header: 'Priority' },
    { key: 'status', header: 'Status' },
  ];

  const dailyPlanColumns: Column<DailyVisitPlanReportRow>[] = [
    { key: 'plan_date', header: 'Date', sortValue: (r) => r.plan_date },
    { key: 'beat_name', header: 'Beat Plan', render: (r) => r.beat_name ?? '—' },
    { key: 'route_name', header: 'Route', render: (r) => r.route_name ?? '—' },
    { key: 'van_name', header: 'Van', render: (r) => r.van_name ?? '—' },
    { key: 'status', header: 'Status' },
    { key: 'total_customers', header: 'Total' },
    { key: 'completed', header: 'Completed' },
    { key: 'pending', header: 'Pending' },
    { key: 'missed', header: 'Missed' },
    { key: 'skipped', header: 'Skipped' },
    { key: 'completion_pct', header: 'Completion %', sortValue: (r) => r.completion_pct },
  ];

  const customerOutcomeColumns: Column<CustomerVisitOutcomeRow>[] = [
    { key: 'plan_date', header: 'Date', sortValue: (r) => r.plan_date },
    { key: 'beat_name', header: 'Beat Plan', render: (r) => r.beat_name ?? '—' },
    { key: 'sequence', header: 'Seq' },
    { key: 'customer_code', header: 'Code' },
    { key: 'business_name', header: 'Customer' },
    { key: 'reason', header: 'Reason', render: (r) => r.reason ?? '—' },
  ];

  const pauseColumns: Column<RoutePauseReportRow>[] = [
    { key: 'plan_date', header: 'Date', sortValue: (r) => r.plan_date },
    { key: 'beat_name', header: 'Beat Plan', render: (r) => r.beat_name ?? '—' },
    { key: 'reason', header: 'Reason' },
    { key: 'pause_time', header: 'Paused At', render: (r) => new Date(r.pause_time).toLocaleString() },
    { key: 'resume_time', header: 'Resumed At', render: (r) => r.resume_time ? new Date(r.resume_time).toLocaleString() : 'Still paused' },
    { key: 'duration_minutes', header: 'Duration (min)', render: (r) => r.duration_minutes ?? '—' },
  ];

  const deviationColumns: Column<RouteDeviationReportRow>[] = [
    { key: 'plan_date', header: 'Date', sortValue: (r) => r.plan_date },
    { key: 'beat_name', header: 'Beat Plan', render: (r) => r.beat_name ?? '—' },
    { key: 'deviation_type', header: 'Type', render: (r) => r.deviation_type.replace(/_/g, ' ') },
    { key: 'description', header: 'Description', render: (r) => r.description ?? '—' },
    { key: 'detected_at', header: 'Detected At', render: (r) => new Date(r.detected_at).toLocaleString() },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-slate-100">
          <FileBarChart size={20} /> Route Reports
        </h1>
        <p className="text-sm text-slate-500">
          Functional subset of the route-reporting suite, built on real Beat Plan / Route Execution data.
          Search, sort, and CSV/Excel export are available on every table below.
        </p>
      </div>

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="label">Report</label>
          <select className="input min-w-[240px]" value={report} onChange={(e) => setReport(e.target.value as ReportKey)}>
            {REPORT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>
        {report !== 'beat_plan_master' && (
          <>
            <div>
              <label className="label">From</label>
              <input type="date" className="input" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div>
              <label className="label">To</label>
              <input type="date" className="input" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </>
        )}
      </div>

      {report === 'beat_plan_master' && (
        <DataTable columns={beatPlanColumns} rows={beatPlanMaster} rowKey={(r) => r.beat_code} loading={loading}
          searchPlaceholder="Search beat plans…" exportFilename="beat_plan_master_report" />
      )}
      {report === 'daily_visit_plan' && (
        <DataTable columns={dailyPlanColumns} rows={dailyPlanReport} rowKey={(r) => `${r.plan_date}-${r.beat_name}-${r.van_name}`} loading={loading}
          searchPlaceholder="Search plans…" exportFilename="daily_visit_plan_report" />
      )}
      {report === 'pending' && (
        <DataTable columns={customerOutcomeColumns} rows={pendingCustomers} rowKey={(r) => `${r.plan_date}-${r.customer_code}-${r.sequence}`} loading={loading}
          searchPlaceholder="Search customers…" exportFilename="pending_customer_report" />
      )}
      {report === 'missed' && (
        <DataTable columns={customerOutcomeColumns} rows={missedCustomers} rowKey={(r) => `${r.plan_date}-${r.customer_code}-${r.sequence}`} loading={loading}
          searchPlaceholder="Search customers…" exportFilename="missed_customer_report" />
      )}
      {report === 'skipped' && (
        <DataTable columns={customerOutcomeColumns} rows={skippedCustomers} rowKey={(r) => `${r.plan_date}-${r.customer_code}-${r.sequence}`} loading={loading}
          searchPlaceholder="Search customers…" exportFilename="skipped_customer_report" />
      )}
      {report === 'rescheduled' && (
        <DataTable columns={customerOutcomeColumns} rows={rescheduledCustomers} rowKey={(r) => `${r.plan_date}-${r.customer_code}-${r.sequence}`} loading={loading}
          searchPlaceholder="Search customers…" exportFilename="rescheduled_customer_report" />
      )}
      {report === 'pause' && (
        <DataTable columns={pauseColumns} rows={pauseReport} rowKey={(r) => `${r.pause_time}-${r.reason}`} loading={loading}
          searchPlaceholder="Search pauses…" exportFilename="route_pause_report" />
      )}
      {report === 'deviation' && (
        <DataTable columns={deviationColumns} rows={deviationReport} rowKey={(r) => `${r.detected_at}-${r.deviation_type}`} loading={loading}
          searchPlaceholder="Search deviations…" exportFilename="route_deviation_report" />
      )}

      <p className="text-xs text-slate-400">
        Not yet built: Beat Plan Customer Assignment, Beat Plan Schedule, Route Assignment, Van Route Assignment,
        Employee Route Assignment, Route Start, Route End, Route Completion (summary), Unplanned Customer,
        Route Sequence Change, Early Route Closure, and Supervisor Action reports.
      </p>
    </div>
  );
}
