import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export type FrequencyType =
  | 'daily' | 'alternate_days' | 'weekly' | 'biweekly' | 'every_n_days' | 'monthly'
  | 'specific_weekdays' | 'specific_dates' | 'first_week' | 'second_week' | 'third_week' | 'last_week' | 'custom_calendar';

export interface BeatPlanSchedule {
  id: string;
  beat_plan_id: string;
  frequency_type: FrequencyType;
  start_date: string;
  end_date: string | null;
  weekdays: number[];
  repeat_interval_days: number | null;
  specific_dates: string[];
  skip_holiday: boolean;
  holiday_handling: 'skip' | 'move_before' | 'move_after' | null;
  is_active: boolean;
  created_at: string;
}

export interface BeatPlanScheduleInput {
  frequency_type: FrequencyType;
  start_date: string;
  end_date?: string | null;
  weekdays?: number[];
  repeat_interval_days?: number | null;
  specific_dates?: string[];
  skip_holiday?: boolean;
  holiday_handling?: 'skip' | 'move_before' | 'move_after' | null;
}

export function useBeatPlanSchedules(beatPlanId: string | undefined) {
  const { company } = useAuth();
  const [schedules, setSchedules] = useState<BeatPlanSchedule[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!beatPlanId) return;
    setLoading(true);
    const { data } = await supabase.from('beat_plan_schedules').select('*')
      .eq('beat_plan_id', beatPlanId).order('created_at', { ascending: false });
    setSchedules((data ?? []) as BeatPlanSchedule[]);
    setLoading(false);
  }, [beatPlanId]);

  useEffect(() => { load(); }, [load]);

  const createSchedule = useCallback(async (input: BeatPlanScheduleInput) => {
    if (!company || !beatPlanId) return { error: 'Missing context' };
    const { data, error } = await supabase.from('beat_plan_schedules').insert({
      company_id: company.id, beat_plan_id: beatPlanId, ...input,
    }).select().single();
    if (error) return { error: error.message };
    await load();
    return { data };
  }, [company, beatPlanId, load]);

  const deactivateSchedule = useCallback(async (id: string) => {
    const { error } = await supabase.from('beat_plan_schedules').update({ is_active: false }).eq('id', id);
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  // Materializes visit dates for a range — idempotent server-side, so calling
  // this again for an overlapping range can never create a duplicate date.
  const generateDates = useCallback(async (scheduleId: string, fromDate: string, toDate: string) => {
    const { data, error } = await supabase.rpc('generate_beat_plan_dates', {
      p_schedule_id: scheduleId, p_from_date: fromDate, p_to_date: toDate,
    });
    if (error) return { error: error.message };
    return { data: data as number }; // count of new dates created
  }, []);

  return { schedules, loading, reload: load, createSchedule, deactivateSchedule, generateDates };
}

export interface BeatPlanScheduleDate {
  id: string;
  visit_date: string;
  original_date: string | null;
  status: 'scheduled' | 'generated' | 'skipped';
}

export function useBeatPlanScheduleDates(beatPlanId: string | undefined, fromDate?: string, toDate?: string) {
  const [dates, setDates] = useState<BeatPlanScheduleDate[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!beatPlanId) return;
    setLoading(true);
    let query = supabase.from('beat_plan_schedule_dates').select('id, visit_date, original_date, status')
      .eq('beat_plan_id', beatPlanId).order('visit_date');
    if (fromDate) query = query.gte('visit_date', fromDate);
    if (toDate) query = query.lte('visit_date', toDate);
    const { data } = await query;
    setDates((data ?? []) as BeatPlanScheduleDate[]);
    setLoading(false);
  }, [beatPlanId, fromDate, toDate]);

  useEffect(() => { load(); }, [load]);

  return { dates, loading, reload: load };
}
