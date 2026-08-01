import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface BeatPlanMasterRow {
  beat_code: string; beat_name: string; area: string | null; status: string; priority: string;
  customer_count: number; route_name: string | null; van_name: string | null;
}

export interface DailyVisitPlanReportRow {
  plan_date: string; beat_name: string | null; route_name: string | null; van_name: string | null;
  status: string; total_customers: number; completed: number; pending: number; missed: number; skipped: number; completion_pct: number;
}

export interface CustomerVisitOutcomeRow {
  plan_date: string; customer_code: string; business_name: string; sequence: number;
  visit_status: string; reason: string | null; beat_name: string | null;
}

export interface RoutePauseReportRow {
  plan_date: string; beat_name: string | null; reason: string; pause_time: string; resume_time: string | null; duration_minutes: number | null;
}

export interface RouteDeviationReportRow {
  plan_date: string; beat_name: string | null; deviation_type: string; description: string | null; detected_at: string;
}

// Backs the reporting subset actually built this phase. Every row is real
// data from the tables/functions written in 0038-0040 — no placeholder rows.
export function useRouteReports(dateFrom: string, dateTo: string) {
  const { company } = useAuth();
  const [beatPlanMaster, setBeatPlanMaster] = useState<BeatPlanMasterRow[]>([]);
  const [dailyPlanReport, setDailyPlanReport] = useState<DailyVisitPlanReportRow[]>([]);
  const [pendingCustomers, setPendingCustomers] = useState<CustomerVisitOutcomeRow[]>([]);
  const [missedCustomers, setMissedCustomers] = useState<CustomerVisitOutcomeRow[]>([]);
  const [skippedCustomers, setSkippedCustomers] = useState<CustomerVisitOutcomeRow[]>([]);
  const [rescheduledCustomers, setRescheduledCustomers] = useState<CustomerVisitOutcomeRow[]>([]);
  const [pauseReport, setPauseReport] = useState<RoutePauseReportRow[]>([]);
  const [deviationReport, setDeviationReport] = useState<RouteDeviationReportRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);

    const { data: beatPlans } = await supabase
      .from('beat_plans')
      .select('id, beat_code, beat_name, area, status, priority, route:routes(name), van:vans(name)')
      .eq('company_id', company.id);
    const bpRows = (beatPlans ?? []) as any[];
    const counts = await Promise.all(bpRows.map((bp: any) =>
      supabase.from('beat_plan_customer_assignments').select('id', { count: 'exact', head: true })
        .eq('beat_plan_id', bp.id).eq('is_active', true)
    ));
    setBeatPlanMaster(bpRows.map((bp, i) => ({
      beat_code: bp.beat_code, beat_name: bp.beat_name, area: bp.area, status: bp.status, priority: bp.priority,
      customer_count: counts[i].count ?? 0, route_name: bp.route?.name ?? null, van_name: bp.van?.name ?? null,
    })));

    const { data: plans } = await supabase
      .from('daily_visit_plans')
      .select('id, plan_date, status, beat_plan:beat_plans(beat_name), route:routes(name), van:vans(name)')
      .eq('company_id', company.id).gte('plan_date', dateFrom).lte('plan_date', dateTo);
    const planRows = (plans ?? []) as any[];
    const progressRows = await Promise.all(planRows.map((p) => supabase.rpc('route_progress', { p_plan_id: p.id }).single()));
    setDailyPlanReport(planRows.map((p, i) => {
      const prog = progressRows[i].data as any;
      return {
        plan_date: p.plan_date, beat_name: p.beat_plan?.beat_name ?? null, route_name: p.route?.name ?? null, van_name: p.van?.name ?? null,
        status: p.status, total_customers: prog?.total_customers ?? 0, completed: prog?.completed ?? 0, pending: prog?.pending ?? 0,
        missed: prog?.missed ?? 0, skipped: prog?.skipped ?? 0, completion_pct: prog?.completion_pct ?? 0,
      };
    }));

    const planIds = planRows.map((p) => p.id);
    if (planIds.length > 0) {
      const { data: items } = await supabase
        .from('daily_visit_plan_items')
        .select('sequence, visit_status, exclusion_reason, customer:customers(customer_code, business_name), plan:daily_visit_plans!inner(plan_date, beat_plan:beat_plans(beat_name))')
        .in('plan_id', planIds)
        .in('visit_status', ['pending', 'ready', 'in_progress', 'missed', 'skipped', 'rescheduled']);

      const rows = (items ?? []) as any[];
      const toRow = (r: any): CustomerVisitOutcomeRow => ({
        plan_date: r.plan?.plan_date, customer_code: r.customer?.customer_code, business_name: r.customer?.business_name,
        sequence: r.sequence, visit_status: r.visit_status, reason: r.exclusion_reason, beat_name: r.plan?.beat_plan?.beat_name ?? null,
      });
      setPendingCustomers(rows.filter((r) => ['pending', 'ready', 'in_progress'].includes(r.visit_status)).map(toRow));
      setMissedCustomers(rows.filter((r) => r.visit_status === 'missed').map(toRow));
      setSkippedCustomers(rows.filter((r) => r.visit_status === 'skipped').map(toRow));
      setRescheduledCustomers(rows.filter((r) => r.visit_status === 'rescheduled').map(toRow));

      const { data: pauses } = await supabase
        .from('route_pause_logs')
        .select('reason, pause_time, resume_time, duration_minutes, session:route_execution_sessions!inner(plan:daily_visit_plans!inner(plan_date, beat_plan:beat_plans(beat_name)))')
        .in('session.plan_id', planIds);
      setPauseReport(((pauses ?? []) as any[]).map((p) => ({
        plan_date: p.session?.plan?.plan_date, beat_name: p.session?.plan?.beat_plan?.beat_name ?? null,
        reason: p.reason, pause_time: p.pause_time, resume_time: p.resume_time, duration_minutes: p.duration_minutes,
      })));

      const { data: deviations } = await supabase
        .from('route_deviation_logs')
        .select('deviation_type, description, detected_at, session:route_execution_sessions!inner(plan:daily_visit_plans!inner(plan_date, beat_plan:beat_plans(beat_name)))')
        .in('session.plan_id', planIds);
      setDeviationReport(((deviations ?? []) as any[]).map((d) => ({
        plan_date: d.session?.plan?.plan_date, beat_name: d.session?.plan?.beat_plan?.beat_name ?? null,
        deviation_type: d.deviation_type, description: d.description, detected_at: d.detected_at,
      })));
    } else {
      setPendingCustomers([]); setMissedCustomers([]); setSkippedCustomers([]); setRescheduledCustomers([]);
      setPauseReport([]); setDeviationReport([]);
    }

    setLoading(false);
  }, [company, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  return {
    beatPlanMaster, dailyPlanReport, pendingCustomers, missedCustomers, skippedCustomers,
    rescheduledCustomers, pauseReport, deviationReport, loading, reload: load,
  };
}
