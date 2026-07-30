import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export type AlertType = 'maintenance_due' | 'fuel_consumption' | 'vehicle_offline' | 'gps_lost'
  | 'permit_expiry' | 'insurance_expiry' | 'registration_expiry' | 'license_expiry' | 'unauthorized_movement';

export interface VehicleAlert {
  id: string;
  van_id: string | null;
  employee_id: string | null;
  alert_type: AlertType;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  is_acknowledged: boolean;
  created_at: string;
  van?: { id: string; name: string } | null;
}

export function useVehicleAlerts() {
  const { company } = useAuth();
  const [alerts, setAlerts] = useState<VehicleAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data } = await supabase
      .from('vehicle_alerts')
      .select('*, van:vans(id,name)')
      .eq('company_id', company.id)
      .order('is_acknowledged', { ascending: true })
      .order('created_at', { ascending: false });
    setAlerts((data ?? []) as unknown as VehicleAlert[]);
    setLoading(false);
  }, [company]);

  useEffect(() => { load(); }, [load]);

  /** Recomputes current alerts (maintenance due, expiring documents, offline vans) — call on page load rather than relying on a background job, since this app has no server to run one. */
  const refresh = useCallback(async () => {
    setRefreshing(true);
    await supabase.rpc('refresh_vehicle_alerts');
    await load();
    setRefreshing(false);
  }, [load]);

  const acknowledge = useCallback(async (id: string) => {
    const { error } = await supabase.rpc('acknowledge_vehicle_alert', { p_alert_id: id });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  const unacknowledgedCount = alerts.filter((a) => !a.is_acknowledged).length;

  return { alerts, loading, refreshing, reload: load, refresh, acknowledge, unacknowledgedCount };
}
