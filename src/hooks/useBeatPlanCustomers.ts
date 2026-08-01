import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface BeatPlanCustomerAssignment {
  id: string;
  customer_id: string;
  beat_plan_id: string;
  route_id: string | null;
  visit_sequence: number;
  original_sequence: number;
  preferred_visit_start_time: string | null;
  preferred_visit_end_time: string | null;
  expected_visit_duration_minutes: number | null;
  visit_frequency_override: string | null;
  priority: 'low' | 'medium' | 'high';
  assigned_van_id: string | null;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  delivery_instructions: string | null;
  sales_notes: string | null;
  collection_notes: string | null;
  special_instructions: string | null;
  assignment_reason: string | null;
  customer?: { customer_code: string; business_name: string } | null;
}

export function useBeatPlanCustomers(beatPlanId: string | undefined) {
  const [assignments, setAssignments] = useState<BeatPlanCustomerAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!beatPlanId) return;
    setLoading(true);
    const { data } = await supabase
      .from('beat_plan_customer_assignments')
      .select('*, customer:customers(customer_code, business_name)')
      .eq('beat_plan_id', beatPlanId)
      .eq('is_active', true)
      .order('visit_sequence');
    setAssignments((data ?? []) as unknown as BeatPlanCustomerAssignment[]);
    setLoading(false);
  }, [beatPlanId]);

  useEffect(() => { load(); }, [load]);

  const assignCustomer = useCallback(async (params: {
    customerId: string; beatPlanId: string; routeId?: string | null; visitSequence: number;
    assignedVanId?: string | null; priority?: 'low' | 'medium' | 'high'; reason?: string;
  }) => {
    const { data, error } = await supabase.rpc('assign_customer_to_beat_plan', {
      p_customer_id: params.customerId,
      p_beat_plan_id: params.beatPlanId,
      p_route_id: params.routeId ?? null,
      p_visit_sequence: params.visitSequence,
      p_assigned_van_id: params.assignedVanId ?? null,
      p_priority: params.priority ?? 'medium',
      p_reason: params.reason ?? null,
    });
    if (error) return { error: error.message };
    await load();
    return { data };
  }, [load]);

  // Ends an assignment (soft — sets is_active false + end_date) rather than
  // deleting, so history remains intact.
  const removeCustomer = useCallback(async (assignmentId: string, reason?: string) => {
    const { error } = await supabase.from('beat_plan_customer_assignments')
      .update({ is_active: false, end_date: new Date().toISOString().slice(0, 10), assignment_reason: reason ?? null })
      .eq('id', assignmentId);
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  const updateInstructions = useCallback(async (assignmentId: string, fields: Partial<Pick<BeatPlanCustomerAssignment,
    'delivery_instructions' | 'sales_notes' | 'collection_notes' | 'special_instructions' | 'preferred_visit_start_time' | 'preferred_visit_end_time'
  >>) => {
    const { error } = await supabase.from('beat_plan_customer_assignments').update(fields).eq('id', assignmentId);
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  return { assignments, loading, reload: load, assignCustomer, removeCustomer, updateInstructions };
}

export interface BeatPlanAssignmentHistoryRow {
  id: string; field_name: string; old_value: string | null; new_value: string | null;
  reason: string | null; changed_by: string | null; changed_at: string;
}

export function useBeatPlanAssignmentHistory(customerId: string | undefined) {
  const [history, setHistory] = useState<BeatPlanAssignmentHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!customerId) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase.from('beat_plan_assignment_history').select('*')
        .eq('customer_id', customerId).order('changed_at', { ascending: false });
      setHistory((data ?? []) as BeatPlanAssignmentHistoryRow[]);
      setLoading(false);
    })();
  }, [customerId]);

  return { history, loading };
}
