import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export type BeatPlanStatus = 'draft' | 'active' | 'inactive' | 'suspended' | 'expired' | 'archived';
export type BeatPlanPriority = 'low' | 'medium' | 'high';

export interface BeatPlan {
  id: string;
  beat_code: string;
  beat_name: string;
  description: string | null;
  branch_id: string | null;
  territory_id: string | null;
  area: string | null;
  route_id: string | null;
  default_van_id: string | null;
  effective_from: string;
  effective_to: string | null;
  expected_start_time: string | null;
  expected_end_time: string | null;
  expected_route_duration_minutes: number | null;
  expected_travel_time_minutes: number | null;
  expected_customer_visit_minutes: number | null;
  priority: BeatPlanPriority;
  status: BeatPlanStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  customer_count?: number;
}

export interface BeatPlanInput {
  beat_code: string;
  beat_name: string;
  description?: string | null;
  branch_id?: string | null;
  territory_id?: string | null;
  area?: string | null;
  route_id?: string | null;
  default_van_id?: string | null;
  effective_from: string;
  effective_to?: string | null;
  expected_start_time?: string | null;
  expected_end_time?: string | null;
  expected_route_duration_minutes?: number | null;
  expected_travel_time_minutes?: number | null;
  expected_customer_visit_minutes?: number | null;
  priority?: BeatPlanPriority;
  notes?: string | null;
}

export interface CapacityCheck { check_name: string; passed: boolean; message: string; }

export function useBeatPlans() {
  const { company, user } = useAuth();
  const [beatPlans, setBeatPlans] = useState<BeatPlan[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data } = await supabase
      .from('beat_plans')
      .select('*')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false });

    const plans = (data ?? []) as BeatPlan[];
    // customer_count is derived server-side via beat_plan_customer_count(); batch it here.
    const counts = await Promise.all(
      plans.map((p) =>
        supabase.from('beat_plan_customer_assignments').select('id', { count: 'exact', head: true })
          .eq('beat_plan_id', p.id).eq('is_active', true)
      )
    );
    plans.forEach((p, i) => { p.customer_count = counts[i].count ?? 0; });
    setBeatPlans(plans);
    setLoading(false);
  }, [company]);

  useEffect(() => { load(); }, [load]);

  const createBeatPlan = useCallback(async (input: BeatPlanInput) => {
    if (!company || !user) return { error: 'Not authenticated' };
    const { data, error } = await supabase.from('beat_plans').insert({
      company_id: company.id, ...input, created_by: user.id, updated_by: user.id,
    }).select().single();
    if (error) return { error: error.message };
    await load();
    return { data };
  }, [company, user, load]);

  const updateBeatPlan = useCallback(async (id: string, input: Partial<BeatPlanInput>) => {
    if (!user) return { error: 'Not authenticated' };
    const { error } = await supabase.from('beat_plans').update({ ...input, updated_by: user.id }).eq('id', id);
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [user, load]);

  const changeStatus = useCallback(async (id: string, newStatus: BeatPlanStatus, reason?: string) => {
    const { error } = await supabase.rpc('change_beat_plan_status', {
      p_beat_plan_id: id, p_new_status: newStatus, p_reason: reason ?? null,
    });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  const deleteDraft = useCallback(async (id: string) => {
    const { error } = await supabase.from('beat_plans').delete().eq('id', id).eq('status', 'draft');
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  const validateCapacity = useCallback(async (id: string): Promise<{ data?: CapacityCheck[]; error?: string }> => {
    const { data, error } = await supabase.rpc('validate_beat_plan_capacity', { p_beat_plan_id: id });
    if (error) return { error: error.message };
    return { data: (data ?? []) as CapacityCheck[] };
  }, []);

  return { beatPlans, loading, reload: load, createBeatPlan, updateBeatPlan, changeStatus, deleteDraft, validateCapacity };
}

export function useBeatPlan(id: string | undefined) {
  const [beatPlan, setBeatPlan] = useState<BeatPlan | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data } = await supabase.from('beat_plans').select('*').eq('id', id).single();
    setBeatPlan(data as BeatPlan | null);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  return { beatPlan, loading, reload: load };
}

export interface BeatPlanStatusHistoryRow {
  id: string; old_status: string | null; new_status: string; reason: string | null;
  changed_by: string | null; changed_at: string;
}

export function useBeatPlanStatusHistory(beatPlanId: string | undefined) {
  const [history, setHistory] = useState<BeatPlanStatusHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!beatPlanId) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase.from('beat_plan_status_history').select('*')
        .eq('beat_plan_id', beatPlanId).order('changed_at', { ascending: false });
      setHistory((data ?? []) as BeatPlanStatusHistoryRow[]);
      setLoading(false);
    })();
  }, [beatPlanId]);

  return { history, loading };
}
