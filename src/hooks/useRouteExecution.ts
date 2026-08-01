import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface RouteExecutionSession {
  id: string;
  plan_id: string;
  van_operation_id: string | null;
  device_id: string | null;
  started_by: string | null;
  start_time: string | null;
  start_odometer: number | null;
  was_offline_at_start: boolean;
  end_time: string | null;
  end_odometer: number | null;
  total_pause_minutes: number;
  completion_pct: number;
  closing_notes: string | null;
  early_closure_reason: string | null;
}

export function useRouteExecutionSession(planId: string | undefined) {
  const [session, setSession] = useState<RouteExecutionSession | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!planId) return;
    setLoading(true);
    const { data } = await supabase.from('route_execution_sessions').select('*').eq('plan_id', planId).maybeSingle();
    setSession(data as RouteExecutionSession | null);
    setLoading(false);
  }, [planId]);

  useEffect(() => { load(); }, [load]);

  // Reuses start_daily_operation() under the hood (Phase 3B.1) — this does
  // not reimplement the van-day lifecycle, it wraps it.
  const startRoute = useCallback(async (params: {
    openingOdometer: number; openingCash?: number; latitude?: number; longitude?: number; deviceUid?: string; isOffline?: boolean;
  }) => {
    if (!planId) return { error: 'No plan' };
    const { data, error } = await supabase.rpc('start_route_execution', {
      p_plan_id: planId, p_opening_odometer: params.openingOdometer, p_opening_cash: params.openingCash ?? 0,
      p_latitude: params.latitude ?? null, p_longitude: params.longitude ?? null,
      p_device_uid: params.deviceUid ?? null, p_is_offline: params.isOffline ?? false,
    });
    if (error) return { error: error.message };
    await load();
    return { data };
  }, [planId, load]);

  const pauseRoute = useCallback(async (reason: string, notes?: string) => {
    if (!planId) return { error: 'No plan' };
    const { error } = await supabase.rpc('pause_route_execution', { p_plan_id: planId, p_reason: reason, p_notes: notes ?? null });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [planId, load]);

  const resumeRoute = useCallback(async () => {
    if (!planId) return { error: 'No plan' };
    const { error } = await supabase.rpc('resume_route_execution', { p_plan_id: planId });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [planId, load]);

  const endRoute = useCallback(async (params: {
    closingOdometer: number; closingCash?: number; latitude?: number; longitude?: number;
    closingNotes?: string; earlyClosureReason?: string;
  }) => {
    if (!planId) return { error: 'No plan' };
    const { error } = await supabase.rpc('end_route_execution', {
      p_plan_id: planId, p_closing_odometer: params.closingOdometer, p_closing_cash: params.closingCash ?? 0,
      p_latitude: params.latitude ?? null, p_longitude: params.longitude ?? null,
      p_closing_notes: params.closingNotes ?? null, p_early_closure_reason: params.earlyClosureReason ?? null,
    });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [planId, load]);

  return { session, loading, reload: load, startRoute, pauseRoute, resumeRoute, endRoute };
}

export interface RoutePauseLog {
  id: string; reason: string; notes: string | null; pause_time: string; resume_time: string | null; duration_minutes: number | null;
}

export function useRoutePauseLogs(sessionId: string | undefined) {
  const [logs, setLogs] = useState<RoutePauseLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionId) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase.from('route_pause_logs').select('*').eq('session_id', sessionId).order('pause_time', { ascending: false });
      setLogs((data ?? []) as RoutePauseLog[]);
      setLoading(false);
    })();
  }, [sessionId]);

  return { logs, loading };
}

export interface RouteDeviationLog {
  id: string; deviation_type: string; description: string | null; detected_at: string;
}

export function useRouteDeviationLogs(sessionId: string | undefined) {
  const [logs, setLogs] = useState<RouteDeviationLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionId) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase.from('route_deviation_logs').select('*').eq('session_id', sessionId).order('detected_at', { ascending: false });
      setLogs((data ?? []) as RouteDeviationLog[]);
      setLoading(false);
    })();
  }, [sessionId]);

  return { logs, loading };
}
