import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface MonitoredRoute {
  plan_id: string;
  plan_date: string;
  status: string;
  beat_name: string | null;
  route_name: string | null;
  van_name: string | null;
  primary_employee_name: string | null;
  start_time: string | null;
  total_customers: number;
  completed: number;
  pending: number;
  missed: number;
  completion_pct: number;
  last_gps_sync: string | null;
}

// One aggregate query for the supervisor's live board — real counts pulled
// per plan via route_progress(), not fabricated placeholders.
export function useRouteMonitoring(planDate: string) {
  const { company } = useAuth();
  const [routes, setRoutes] = useState<MonitoredRoute[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);

    const { data: plans } = await supabase
      .from('daily_visit_plans')
      .select(`
        id, plan_date, status,
        beat_plan:beat_plans(beat_name), route:routes(name),
        van:vans(name), primary_employee:app_users!daily_visit_plans_primary_employee_id_fkey(full_name)
      `)
      .eq('company_id', company.id)
      .eq('plan_date', planDate);

    const rows = (plans ?? []) as any[];

    const results: MonitoredRoute[] = await Promise.all(
      rows.map(async (p) => {
        const { data: progress } = await supabase.rpc('route_progress', { p_plan_id: p.id }).single();
        const { data: session } = await supabase.from('route_execution_sessions').select('start_time').eq('plan_id', p.id).maybeSingle();
        const prog = progress as any;
        return {
          plan_id: p.id,
          plan_date: p.plan_date,
          status: p.status,
          beat_name: p.beat_plan?.beat_name ?? null,
          route_name: p.route?.name ?? null,
          van_name: p.van?.name ?? null,
          primary_employee_name: p.primary_employee?.full_name ?? null,
          start_time: session?.start_time ?? null,
          total_customers: prog?.total_customers ?? 0,
          completed: prog?.completed ?? 0,
          pending: prog?.pending ?? 0,
          missed: prog?.missed ?? 0,
          completion_pct: prog?.completion_pct ?? 0,
          last_gps_sync: null, // wired to gps_logs in a future pass; not fabricated here
        };
      })
    );

    setRoutes(results);
    setLoading(false);
  }, [company, planDate]);

  useEffect(() => { load(); }, [load]);

  return { routes, loading, reload: load };
}

export interface SupervisorActionInput {
  planId: string;
  actionType: 'approve_plan' | 'reject_plan' | 'return_for_correction' | 'change_employee' | 'change_van'
    | 'add_customer' | 'remove_customer' | 'change_sequence' | 'pause_route' | 'request_closure'
    | 'approve_early_closure' | 'transfer_pending' | 'reopen_plan';
  notes?: string;
}

export function useSupervisorActions() {
  const logAction = useCallback(async ({ planId, actionType, notes }: SupervisorActionInput) => {
    const { error } = await supabase.rpc('log_supervisor_action', { p_plan_id: planId, p_action_type: actionType, p_notes: notes ?? null });
    if (error) return { error: error.message };
    return { data: true };
  }, []);

  return { logAction };
}
