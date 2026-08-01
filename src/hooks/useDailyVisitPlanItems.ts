import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type VisitItemStatus =
  | 'pending' | 'ready' | 'in_progress' | 'completed' | 'missed' | 'skipped'
  | 'cancelled' | 'rescheduled' | 'unplanned' | 'not_applicable';

export interface DailyVisitPlanItem {
  id: string;
  plan_id: string;
  customer_id: string;
  sequence: number;
  original_sequence: number;
  scheduled_time: string | null;
  estimated_arrival_time: string | null;
  expected_duration_minutes: number | null;
  priority: 'low' | 'medium' | 'high';
  assigned_employee_id: string | null;
  special_instructions: string | null;
  plan_notes: string | null;
  visit_status: VisitItemStatus;
  is_unplanned: boolean;
  exclusion_reason: string | null;
  customer?: {
    customer_code: string; business_name: string; area: string | null;
    latitude: number | null; longitude: number | null; status: string;
    outstanding_balance: number | null; credit_limit: number | null;
    primary_phone: string | null;
  } | null;
}

export function useDailyVisitPlanItems(planId: string | undefined) {
  const [items, setItems] = useState<DailyVisitPlanItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!planId) return;
    setLoading(true);
    const { data } = await supabase
      .from('daily_visit_plan_items')
      .select('*, customer:customers(customer_code, business_name, area, latitude, longitude, status, outstanding_balance, credit_limit, primary_phone)')
      .eq('plan_id', planId)
      .order('sequence');
    setItems((data ?? []) as unknown as DailyVisitPlanItem[]);
    setLoading(false);
  }, [planId]);

  useEffect(() => { load(); }, [load]);

  const reorder = useCallback(async (itemId: string, newSequence: number, reason?: string) => {
    const { error } = await supabase.rpc('reorder_plan_item', { p_item_id: itemId, p_new_sequence: newSequence, p_reason: reason ?? null });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  const skipCustomer = useCallback(async (itemId: string, params: {
    reason: string; notes?: string; latitude?: number; longitude?: number; rescheduleRequired?: boolean;
  }) => {
    const { error } = await supabase.rpc('skip_plan_customer', {
      p_item_id: itemId, p_reason: params.reason, p_notes: params.notes ?? null,
      p_latitude: params.latitude ?? null, p_longitude: params.longitude ?? null,
      p_reschedule_required: params.rescheduleRequired ?? false,
    });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  const rescheduleCustomer = useCallback(async (itemId: string, params: {
    newDate: string; newBeatPlanId?: string; newRouteId?: string; preferredTime?: string; reason?: string; notes?: string;
  }) => {
    const { data, error } = await supabase.rpc('reschedule_plan_customer', {
      p_item_id: itemId, p_new_date: params.newDate, p_new_beat_plan_id: params.newBeatPlanId ?? null,
      p_new_route_id: params.newRouteId ?? null, p_preferred_time: params.preferredTime ?? null,
      p_reason: params.reason ?? null, p_notes: params.notes ?? null,
    });
    if (error) return { error: error.message };
    await load();
    return { data };
  }, [load]);

  const addUnplannedCustomer = useCallback(async (planIdArg: string, customerId: string, reason: string, lat?: number, lng?: number) => {
    const { data, error } = await supabase.rpc('add_unplanned_customer', {
      p_plan_id: planIdArg, p_customer_id: customerId, p_reason: reason, p_latitude: lat ?? null, p_longitude: lng ?? null,
    });
    if (error) return { error: error.message };
    await load();
    return { data };
  }, [load]);

  return { items, loading, reload: load, reorder, skipCustomer, rescheduleCustomer, addUnplannedCustomer };
}

export interface RouteProgress {
  total_customers: number; completed: number; pending: number; missed: number;
  skipped: number; rescheduled: number; cancelled: number; unplanned: number; completion_pct: number;
}

export function useRouteProgress(planId: string | undefined) {
  const [progress, setProgress] = useState<RouteProgress | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!planId) return;
    setLoading(true);
    const { data } = await supabase.rpc('route_progress', { p_plan_id: planId }).single();
    setProgress(data as RouteProgress | null);
    setLoading(false);
  }, [planId]);

  useEffect(() => { load(); }, [load]);

  return { progress, loading, reload: load };
}
