import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface Visit {
  id: string;
  route_id: string | null;
  customer_id: string;
  salesman_id: string | null;
  visit_date: string;
  check_in_at: string | null;
  check_in_lat: number | null;
  check_in_lng: number | null;
  check_out_at: string | null;
  status: 'planned' | 'checked_in' | 'completed' | 'missed';
  notes: string | null;
  customer?: { id: string; business_name: string; address: string | null } | null;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function getCurrentPosition(): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      () => resolve(null),
      { timeout: 8000 }
    );
  });
}

export function useTodayVisits(routeId: string | null) {
  const { company, user } = useAuth();
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company || !routeId) { setVisits([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from('customer_visits')
      .select('*, customer:customers(id,business_name,address)')
      .eq('company_id', company.id)
      .eq('route_id', routeId)
      .eq('visit_date', todayIso())
      .order('created_at', { ascending: true });
    setLoading(false);
    setVisits((data ?? []) as unknown as Visit[]);
  }, [company, routeId]);

  useEffect(() => { load(); }, [load]);

  /** Creates today's planned visits from the route's assigned customers, skipping any already created. */
  const startTodaysVisits = useCallback(async () => {
    if (!company || !routeId || !user) return { error: 'Missing context' };

    const { data: routeCustomers } = await supabase
      .from('route_customers')
      .select('customer_id')
      .eq('route_id', routeId)
      .order('visit_sequence', { ascending: true });

    if (!routeCustomers || routeCustomers.length === 0) {
      return { error: 'This route has no customers assigned yet.' };
    }

    const { data: existing } = await supabase
      .from('customer_visits')
      .select('customer_id')
      .eq('company_id', company.id)
      .eq('route_id', routeId)
      .eq('visit_date', todayIso());

    const existingIds = new Set((existing ?? []).map((r) => r.customer_id));
    const toCreate = routeCustomers.filter((rc) => !existingIds.has(rc.customer_id));

    if (toCreate.length === 0) return { error: null };

    const { error } = await supabase.from('customer_visits').insert(
      toCreate.map((rc) => ({
        company_id: company.id, route_id: routeId, customer_id: rc.customer_id,
        salesman_id: user.id, visit_date: todayIso(), status: 'planned',
      }))
    );
    if (error) return { error: error.message };
    await load();
    return { error: null };
  }, [company, routeId, user, load]);

  const checkIn = useCallback(async (visitId: string) => {
    const pos = await getCurrentPosition();
    const { error } = await supabase.from('customer_visits').update({
      status: 'checked_in',
      check_in_at: new Date().toISOString(),
      check_in_lat: pos?.coords.latitude ?? null,
      check_in_lng: pos?.coords.longitude ?? null,
    }).eq('id', visitId);
    if (!error) await load();
    return { error: error?.message ?? null, hadGps: !!pos };
  }, [load]);

  const checkOut = useCallback(async (visitId: string, notes?: string) => {
    const pos = await getCurrentPosition();
    const { error } = await supabase.from('customer_visits').update({
      status: 'completed',
      check_out_at: new Date().toISOString(),
      check_out_lat: pos?.coords.latitude ?? null,
      check_out_lng: pos?.coords.longitude ?? null,
      notes: notes || null,
    }).eq('id', visitId);
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  const markMissed = useCallback(async (visitId: string) => {
    const { error } = await supabase.from('customer_visits').update({ status: 'missed' }).eq('id', visitId);
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  return { visits, loading, reload: load, startTodaysVisits, checkIn, checkOut, markMissed };
}
