import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface RouteRow {
  id: string;
  company_id: string;
  code: string;
  name: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  van_id: string | null;
  salesman_id: string | null;
  is_active: boolean;
  created_at: string;
  van?: { id: string; name: string } | null;
  salesman?: { id: string; full_name: string } | null;
}

export type RouteInput = Omit<RouteRow, 'id' | 'company_id' | 'created_at' | 'van' | 'salesman'>;

export interface RouteCustomer {
  id: string;
  route_id: string;
  customer_id: string;
  visit_sequence: number;
  day_of_week: number | null;
  customer?: { id: string; business_name: string; address: string | null } | null;
}

const SELECT = '*, van:vans(id,name), salesman:app_users!routes_salesman_id_fkey(id,full_name)';

export function useRoutes() {
  const { company } = useAuth();
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data } = await supabase.from('routes').select(SELECT).eq('company_id', company.id).order('name');
    setLoading(false);
    setRoutes((data ?? []) as unknown as RouteRow[]);
  }, [company]);

  useEffect(() => { load(); }, [load]);

  const createRoute = useCallback(async (input: RouteInput) => {
    if (!company) return { error: 'No company context' };
    const { error } = await supabase.from('routes').insert({ ...input, company_id: company.id });
    if (!error) await load();
    return { error: error ? (error.code === '23505' ? 'A route with this code already exists.' : error.message) : null };
  }, [company, load]);

  const updateRoute = useCallback(async (id: string, input: Partial<RouteInput>) => {
    const { error } = await supabase.from('routes').update(input).eq('id', id);
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  const deactivateRoute = useCallback(async (id: string) => {
    const { error } = await supabase.from('routes').update({ is_active: false }).eq('id', id);
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  return { routes, loading, reload: load, createRoute, updateRoute, deactivateRoute };
}

export function useRouteCustomers(routeId: string | null) {
  const [assignments, setAssignments] = useState<RouteCustomer[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!routeId) { setAssignments([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from('route_customers')
      .select('*, customer:customers(id,business_name,address)')
      .eq('route_id', routeId)
      .order('visit_sequence', { ascending: true });
    setLoading(false);
    setAssignments((data ?? []) as unknown as RouteCustomer[]);
  }, [routeId]);

  useEffect(() => { load(); }, [load]);

  const addCustomer = useCallback(async (customerId: string) => {
    if (!routeId) return { error: 'No route selected' };
    const nextSeq = assignments.length > 0 ? Math.max(...assignments.map((a) => a.visit_sequence)) + 1 : 1;
    const { error } = await supabase.from('route_customers').insert({
      route_id: routeId, customer_id: customerId, visit_sequence: nextSeq,
    });
    if (!error) await load();
    return { error: error ? (error.code === '23505' ? 'Customer already on this route.' : error.message) : null };
  }, [routeId, assignments, load]);

  const updateSequence = useCallback(async (id: string, sequence: number) => {
    const { error } = await supabase.from('route_customers').update({ visit_sequence: sequence }).eq('id', id);
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  const removeCustomer = useCallback(async (id: string) => {
    const { error } = await supabase.from('route_customers').delete().eq('id', id);
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  return { assignments, loading, reload: load, addCustomer, updateSequence, removeCustomer };
}
