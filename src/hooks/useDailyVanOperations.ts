import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export type OperationStatus = 'not_started' | 'in_progress' | 'paused' | 'ended' | 'cancelled';

export interface DailyVanOperation {
  id: string;
  van_id: string;
  route_id: string | null;
  operation_date: string;
  status: OperationStatus;
  opening_time: string | null;
  closing_time: string | null;
  opening_odometer: number | null;
  closing_odometer: number | null;
  opening_cash: number;
  closing_cash: number | null;
  opening_stock_value: number | null;
  closing_stock_value: number | null;
  opening_signature_data: string | null;
  closing_signature_data: string | null;
  notes: string | null;
  cancel_reason: string | null;
  created_at: string;
  van?: { id: string; name: string; code: string } | null;
  route?: { id: string; name: string } | null;
}

function todayIso() { return new Date().toISOString().slice(0, 10); }

export function useDailyVanOperations(dateFilter?: string) {
  const { company } = useAuth();
  const [operations, setOperations] = useState<DailyVanOperation[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    let query = supabase.from('daily_van_operations').select('*, van:vans(id,name,code), route:routes(id,name)').eq('company_id', company.id);
    if (dateFilter) query = query.eq('operation_date', dateFilter);
    const { data } = await query.order('operation_date', { ascending: false });
    setOperations((data ?? []) as unknown as DailyVanOperation[]);
    setLoading(false);
  }, [company, dateFilter]);

  useEffect(() => { load(); }, [load]);

  const startOperation = useCallback(async (params: {
    vanId: string; routeId?: string; openingOdometer: number; openingCash: number; signatureData?: string; notes?: string;
  }) => {
    const { data, error } = await supabase.rpc('start_daily_operation', {
      p_van_id: params.vanId, p_route_id: params.routeId ?? null, p_opening_odometer: params.openingOdometer,
      p_opening_cash: params.openingCash, p_signature_data: params.signatureData ?? null, p_notes: params.notes ?? null,
    });
    if (error) return { error: error.message, id: null };
    await load();
    return { error: null, id: data as string };
  }, [load]);

  const pauseOperation = useCallback(async (id: string) => {
    const { error } = await supabase.rpc('pause_daily_operation', { p_operation_id: id });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  const resumeOperation = useCallback(async (id: string) => {
    const { error } = await supabase.rpc('resume_daily_operation', { p_operation_id: id });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  const endOperation = useCallback(async (params: {
    id: string; closingOdometer: number; closingCash: number; signatureData?: string; notes?: string;
  }) => {
    const { error } = await supabase.rpc('end_daily_operation', {
      p_operation_id: params.id, p_closing_odometer: params.closingOdometer, p_closing_cash: params.closingCash,
      p_signature_data: params.signatureData ?? null, p_notes: params.notes ?? null,
    });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  const cancelOperation = useCallback(async (id: string, reason: string) => {
    const { error } = await supabase.rpc('cancel_daily_operation', { p_operation_id: id, p_reason: reason });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  return { operations, loading, reload: load, startOperation, pauseOperation, resumeOperation, endOperation, cancelOperation };
}

export { todayIso };
