import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export type DailyPlanStatus =
  | 'draft' | 'generated' | 'pending_approval' | 'approved' | 'ready' | 'started'
  | 'paused' | 'completed' | 'partially_completed' | 'cancelled' | 'closed';

export interface DailyVisitPlan {
  id: string;
  plan_date: string;
  branch_id: string | null;
  territory_id: string | null;
  route_id: string | null;
  beat_plan_id: string | null;
  van_id: string | null;
  primary_employee_id: string | null;
  supervisor_id: string | null;
  planned_start_time: string | null;
  planned_end_time: string | null;
  expected_distance_km: number | null;
  expected_duration_minutes: number | null;
  status: DailyPlanStatus;
  generation_type: 'automatic' | 'manual' | 'bulk';
  notes: string | null;
  created_at: string;
  beat_plan?: { beat_code: string; beat_name: string } | null;
  route?: { code: string; name: string } | null;
  van?: { code: string; name: string } | null;
}

export function useDailyVisitPlans(dateFrom?: string, dateTo?: string) {
  const { company } = useAuth();
  const [plans, setPlans] = useState<DailyVisitPlan[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    let query = supabase
      .from('daily_visit_plans')
      .select('*, beat_plan:beat_plans(beat_code, beat_name), route:routes(code, name), van:vans(code, name)')
      .eq('company_id', company.id)
      .order('plan_date', { ascending: false });
    if (dateFrom) query = query.gte('plan_date', dateFrom);
    if (dateTo) query = query.lte('plan_date', dateTo);
    const { data } = await query;
    setPlans((data ?? []) as unknown as DailyVisitPlan[]);
    setLoading(false);
  }, [company, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const generatePlan = useCallback(async (beatPlanId: string, planDate: string) => {
    const { data, error } = await supabase.rpc('generate_daily_visit_plan', {
      p_beat_plan_id: beatPlanId, p_plan_date: planDate,
    });
    if (error) return { error: error.message };
    await load();
    return { data: data as string }; // new plan id
  }, [load]);

  const createManualPlan = useCallback(async (input: {
    plan_date: string; branch_id?: string | null; territory_id?: string | null; route_id?: string | null;
    van_id?: string | null; planned_start_time?: string | null; planned_end_time?: string | null; notes?: string | null;
  }) => {
    if (!company) return { error: 'Not authenticated' };
    const { data, error } = await supabase.from('daily_visit_plans').insert({
      company_id: company.id, ...input, status: 'draft', generation_type: 'manual',
    }).select().single();
    if (error) return { error: error.message };
    await load();
    return { data };
  }, [company, load]);

  const submitForApproval = useCallback(async (planId: string, notes?: string) => {
    const { error } = await supabase.rpc('submit_daily_plan', { p_plan_id: planId, p_notes: notes ?? null });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  const decidePlan = useCallback(async (planId: string, approve: boolean, reason?: string) => {
    const { error } = await supabase.rpc('decide_daily_plan', { p_plan_id: planId, p_approve: approve, p_reason: reason ?? null });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  const changeStatus = useCallback(async (planId: string, newStatus: DailyPlanStatus, reason?: string) => {
    const { error } = await supabase.rpc('change_daily_plan_status', { p_plan_id: planId, p_new_status: newStatus, p_reason: reason ?? null });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  const reopenPlan = useCallback(async (planId: string, reason: string) => {
    const { error } = await supabase.rpc('reopen_daily_plan', { p_plan_id: planId, p_reason: reason });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  return {
    plans, loading, reload: load, generatePlan, createManualPlan,
    submitForApproval, decidePlan, changeStatus, reopenPlan,
  };
}

export function useDailyVisitPlan(planId: string | undefined) {
  const [plan, setPlan] = useState<DailyVisitPlan | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!planId) return;
    setLoading(true);
    const { data } = await supabase
      .from('daily_visit_plans')
      .select('*, beat_plan:beat_plans(beat_code, beat_name), route:routes(code, name), van:vans(code, name)')
      .eq('id', planId).single();
    setPlan(data as unknown as DailyVisitPlan | null);
    setLoading(false);
  }, [planId]);

  useEffect(() => { load(); }, [load]);

  return { plan, loading, reload: load };
}

export interface DailyVisitPlanEmployee {
  id: string; employee_id: string; role_code: string; is_primary: boolean; is_supervisor: boolean; is_route_executor: boolean;
  employee?: { full_name: string; employee_code: string | null } | null;
}

export function useDailyVisitPlanEmployees(planId: string | undefined) {
  const [employees, setEmployees] = useState<DailyVisitPlanEmployee[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!planId) return;
    setLoading(true);
    const { data } = await supabase
      .from('daily_visit_plan_employees')
      .select('*, employee:app_users(full_name, employee_code)')
      .eq('plan_id', planId);
    setEmployees((data ?? []) as unknown as DailyVisitPlanEmployee[]);
    setLoading(false);
  }, [planId]);

  useEffect(() => { load(); }, [load]);

  const addEmployee = useCallback(async (employeeId: string, roleCode: string, isPrimary = false) => {
    if (!planId) return { error: 'No plan' };
    const { error } = await supabase.from('daily_visit_plan_employees').insert({
      plan_id: planId, employee_id: employeeId, role_code: roleCode, is_primary: isPrimary,
    });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [planId, load]);

  const removeEmployee = useCallback(async (rowId: string) => {
    const { error } = await supabase.from('daily_visit_plan_employees').delete().eq('id', rowId);
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  return { employees, loading, reload: load, addEmployee, removeEmployee };
}

export interface DailyVisitPlanApprovalRow {
  id: string; action: string; requested_by: string | null; approved_by: string | null; rejected_by: string | null;
  reason: string | null; notes: string | null; created_at: string;
}

export function useDailyVisitPlanApprovalHistory(planId: string | undefined) {
  const [history, setHistory] = useState<DailyVisitPlanApprovalRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!planId) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase.from('daily_visit_plan_approval_history').select('*')
        .eq('plan_id', planId).order('created_at', { ascending: false });
      setHistory((data ?? []) as DailyVisitPlanApprovalRow[]);
      setLoading(false);
    })();
  }, [planId]);

  return { history, loading };
}
