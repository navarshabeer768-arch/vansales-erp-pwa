import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface Device {
  id: string;
  device_uid: string;
  device_name: string;
  device_model: string | null;
  manufacturer: string | null;
  os_version: string | null;
  device_type: 'android_pdt' | 'tablet' | 'desktop' | 'other';
  status: 'active' | 'inactive' | 'blocked';
  assigned_employee_id: string | null;
  assigned_van_id: string | null;
  assigned_warehouse_id: string | null;
  last_sync_at: string | null;
  last_login_at: string | null;
  created_at: string;
  employee?: { id: string; full_name: string } | null;
  van?: { id: string; name: string } | null;
  warehouse?: { id: string; name: string } | null;
}

export function useDevices() {
  const { company } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data } = await supabase
      .from('devices')
      .select('*, employee:app_users(id,full_name), van:vans(id,name), warehouse:warehouses(id,name)')
      .eq('company_id', company.id)
      .order('last_login_at', { ascending: false, nullsFirst: false });
    setDevices((data ?? []) as unknown as Device[]);
    setLoading(false);
  }, [company]);

  useEffect(() => { load(); }, [load]);

  const renameDevice = useCallback(async (id: string, name: string) => {
    const { error } = await supabase.from('devices').update({ device_name: name }).eq('id', id);
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  const assignDevice = useCallback(async (id: string, params: { employeeId?: string | null; vanId?: string | null; warehouseId?: string | null }) => {
    const { error } = await supabase.from('devices').update({
      assigned_employee_id: params.employeeId ?? null, assigned_van_id: params.vanId ?? null, assigned_warehouse_id: params.warehouseId ?? null,
    }).eq('id', id);
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  const setStatus = useCallback(async (id: string, status: Device['status']) => {
    const { error } = await supabase.from('devices').update({ status }).eq('id', id);
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  const removeDevice = useCallback(async (id: string) => {
    const { error } = await supabase.from('devices').delete().eq('id', id);
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  return { devices, loading, reload: load, renameDevice, assignDevice, setStatus, removeDevice };
}

export interface DeviceSession { id: string; login_at: string; logout_at: string | null; employee?: { full_name: string } | null; }

export async function fetchDeviceSessions(deviceId: string): Promise<DeviceSession[]> {
  const { data } = await supabase
    .from('device_sessions')
    .select('id, login_at, logout_at, employee:app_users(full_name)')
    .eq('device_id', deviceId)
    .order('login_at', { ascending: false })
    .limit(50);
  return (data ?? []) as unknown as DeviceSession[];
}
