import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export type FenceType = 'warehouse' | 'customer' | 'route' | 'custom';

export interface Geofence {
  id: string;
  name: string;
  fence_type: FenceType;
  warehouse_id: string | null;
  customer_id: string | null;
  route_id: string | null;
  center_lat: number;
  center_lng: number;
  radius_meters: number;
  is_active: boolean;
}

export function useGeofences() {
  const { company } = useAuth();
  const [fences, setFences] = useState<Geofence[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data } = await supabase.from('geofences').select('*').eq('company_id', company.id).order('name');
    setFences((data ?? []) as Geofence[]);
    setLoading(false);
  }, [company]);

  useEffect(() => { load(); }, [load]);

  const createFence = useCallback(async (params: {
    name: string; fenceType: FenceType; centerLat: number; centerLng: number; radiusMeters: number;
    warehouseId?: string; customerId?: string; routeId?: string;
  }) => {
    if (!company) return { error: 'No company context' };
    const { error } = await supabase.from('geofences').insert({
      company_id: company.id, name: params.name, fence_type: params.fenceType,
      center_lat: params.centerLat, center_lng: params.centerLng, radius_meters: params.radiusMeters,
      warehouse_id: params.warehouseId || null, customer_id: params.customerId || null, route_id: params.routeId || null,
    });
    if (error) return { error: error.message };
    await load();
    return { error: null };
  }, [company, load]);

  const deactivateFence = useCallback(async (id: string) => {
    const { error } = await supabase.from('geofences').update({ is_active: false }).eq('id', id);
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  return { fences, loading, reload: load, createFence, deactivateFence };
}

export interface GeofenceEvent {
  id: string;
  van_id: string;
  geofence_id: string;
  event_type: 'arrival' | 'exit';
  occurred_at: string;
  van?: { name: string } | null;
  geofence?: { name: string } | null;
}

export function useGeofenceEvents(vanId: string | null) {
  const { company } = useAuth();
  const [events, setEvents] = useState<GeofenceEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!company) return;
    (async () => {
      setLoading(true);
      let query = supabase.from('geofence_events').select('*, van:vans(name), geofence:geofences(name)').eq('company_id', company.id);
      if (vanId) query = query.eq('van_id', vanId);
      const { data } = await query.order('occurred_at', { ascending: false }).limit(200);
      setEvents((data ?? []) as unknown as GeofenceEvent[]);
      setLoading(false);
    })();
  }, [company, vanId]);

  return { events, loading };
}

export interface VanGpsStats {
  distance_km: number;
  travel_minutes: number;
  stop_minutes: number;
  point_count: number;
  first_seen: string | null;
  last_seen: string | null;
}

export function useVanGpsStats(vanId: string | null, date: string) {
  const [stats, setStats] = useState<VanGpsStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!vanId) { setStats(null); setLoading(false); return; }
    setLoading(true);
    supabase.rpc('van_gps_stats', { p_van_id: vanId, p_date: date }).then(({ data }) => {
      setStats((data?.[0] as VanGpsStats) ?? null);
      setLoading(false);
    });
  }, [vanId, date]);

  return { stats, loading };
}

export interface GpsPoint { latitude: number; longitude: number; speed_kmh: number | null; recorded_at: string; }

export async function fetchGpsHistory(vanId: string, date: string): Promise<GpsPoint[]> {
  const { data } = await supabase
    .from('gps_logs')
    .select('latitude, longitude, speed_kmh, recorded_at')
    .eq('van_id', vanId)
    .gte('recorded_at', `${date}T00:00:00`)
    .lte('recorded_at', `${date}T23:59:59`)
    .order('recorded_at', { ascending: true });
  return (data ?? []) as GpsPoint[];
}
