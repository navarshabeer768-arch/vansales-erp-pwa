import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface VanPosition {
  id: string;
  name: string;
  code: string;
  current_latitude: number | null;
  current_longitude: number | null;
  last_location_at: string | null;
  staff: { full_name: string; role_code: string }[];
}

export function useVanPositions() {
  const { company } = useAuth();
  const [vans, setVans] = useState<VanPosition[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const [{ data: vanRows }, { data: staffRows }] = await Promise.all([
      supabase
        .from('vans')
        .select('id, name, code, current_latitude, current_longitude, last_location_at')
        .eq('company_id', company.id)
        .order('name'),
      supabase
        .from('van_staff_assignments')
        .select('van_id, role_code, employee:app_users(full_name)')
        .eq('company_id', company.id)
        .eq('status', 'active'),
    ]);
    const staffByVan = new Map<string, { full_name: string; role_code: string }[]>();
    for (const s of (staffRows ?? []) as any[]) {
      const list = staffByVan.get(s.van_id) ?? [];
      list.push({ full_name: s.employee?.full_name ?? '—', role_code: s.role_code });
      staffByVan.set(s.van_id, list);
    }
    setVans(((vanRows ?? []) as any[]).map((v) => ({ ...v, staff: staffByVan.get(v.id) ?? [] })));
    setLoading(false);
  }, [company]);

  useEffect(() => { load(); }, [load]);

  // Light auto-refresh so positions update while this page is open.
  useEffect(() => {
    const interval = setInterval(load, 20000);
    return () => clearInterval(interval);
  }, [load]);

  return { vans, loading, reload: load };
}

/** Drivers/salesmen call this to broadcast their van's live position while on the road. */
export function useShareLocation(vanId: string | null) {
  const { company, user } = useAuth();
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastUploadRef = useRef<number>(0);

  const start = useCallback(() => {
    if (!vanId || !company || !user || !navigator.geolocation) {
      setError('Location isn\'t available on this device/browser.');
      return;
    }
    setError(null);
    watchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const now = Date.now();
        if (now - lastUploadRef.current < 15000) return; // throttle uploads to ~1 per 15s
        lastUploadRef.current = now;

        const { latitude, longitude, speed, heading } = pos.coords;
        await Promise.all([
          supabase.from('vans').update({
            current_latitude: latitude, current_longitude: longitude, last_location_at: new Date().toISOString(),
          }).eq('id', vanId),
          supabase.from('gps_logs').insert({
            company_id: company.id, van_id: vanId, user_id: user.id,
            latitude, longitude, speed_kmh: speed ? speed * 3.6 : null, heading: heading ?? null,
          }),
        ]);
      },
      () => setError('Location access was denied.'),
      { enableHighAccuracy: true, maximumAge: 10000 }
    );
    setSharing(true);
  }, [vanId, company, user]);

  const stop = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setSharing(false);
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { sharing, error, start, stop };
}
