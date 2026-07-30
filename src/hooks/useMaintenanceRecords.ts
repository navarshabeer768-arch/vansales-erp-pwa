import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export type MaintenanceType = 'oil_change' | 'brake_service' | 'tyre_replacement' | 'battery_replacement' | 'general_service' | 'inspection' | 'custom';

export interface MaintenanceRecord {
  id: string;
  van_id: string;
  maintenance_type: MaintenanceType;
  description: string | null;
  service_date: string;
  odometer_reading: number | null;
  cost: number;
  vendor: string | null;
  invoice_url: string | null;
  next_service_date: string | null;
  next_service_odometer: number | null;
  status: 'scheduled' | 'completed' | 'cancelled';
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  van?: { id: string; name: string; code: string } | null;
}

export function useMaintenanceRecords(vanId: string | null) {
  const { company } = useAuth();
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    let query = supabase.from('maintenance_records').select('*, van:vans(id,name,code)').eq('company_id', company.id);
    if (vanId) query = query.eq('van_id', vanId);
    const { data } = await query.order('service_date', { ascending: false });
    setRecords((data ?? []) as unknown as MaintenanceRecord[]);
    setLoading(false);
  }, [company, vanId]);

  useEffect(() => { load(); }, [load]);

  const createRecord = useCallback(async (params: {
    vanId: string; maintenanceType: MaintenanceType; description?: string; serviceDate: string;
    odometerReading?: number; cost: number; vendor?: string; invoiceUrl?: string;
    nextServiceDate?: string; nextServiceOdometer?: number; status?: MaintenanceRecord['status'];
  }) => {
    if (!company) return { error: 'No company context' };
    const { error } = await supabase.from('maintenance_records').insert({
      company_id: company.id, van_id: params.vanId, maintenance_type: params.maintenanceType,
      description: params.description || null, service_date: params.serviceDate,
      odometer_reading: params.odometerReading ?? null, cost: params.cost, vendor: params.vendor || null,
      invoice_url: params.invoiceUrl || null, next_service_date: params.nextServiceDate || null,
      next_service_odometer: params.nextServiceOdometer ?? null, status: params.status ?? 'completed',
    });
    if (error) return { error: error.message };
    await load();
    return { error: null };
  }, [company, load]);

  const approveRecord = useCallback(async (id: string) => {
    const { error } = await supabase.rpc('approve_maintenance', { p_record_id: id });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  const deleteRecord = useCallback(async (id: string) => {
    const { error } = await supabase.from('maintenance_records').delete().eq('id', id);
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  return { records, loading, reload: load, createRecord, approveRecord, deleteRecord };
}

export interface MaintenanceSchedule {
  id: string;
  van_id: string;
  maintenance_type: MaintenanceType;
  interval_km: number | null;
  interval_days: number | null;
  last_service_date: string | null;
  last_service_odometer: number | null;
  is_active: boolean;
  van?: { id: string; name: string; current_odometer: number | null } | null;
}

export function useMaintenanceSchedules(vanId: string | null) {
  const { company } = useAuth();
  const [schedules, setSchedules] = useState<MaintenanceSchedule[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    let query = supabase.from('maintenance_schedules').select('*, van:vans(id,name,current_odometer)').eq('company_id', company.id).eq('is_active', true);
    if (vanId) query = query.eq('van_id', vanId);
    const { data } = await query;
    setSchedules((data ?? []) as unknown as MaintenanceSchedule[]);
    setLoading(false);
  }, [company, vanId]);

  useEffect(() => { load(); }, [load]);

  const createSchedule = useCallback(async (params: {
    vanId: string; maintenanceType: MaintenanceType; intervalKm?: number; intervalDays?: number;
    lastServiceDate?: string; lastServiceOdometer?: number;
  }) => {
    if (!company) return { error: 'No company context' };
    const { error } = await supabase.from('maintenance_schedules').insert({
      company_id: company.id, van_id: params.vanId, maintenance_type: params.maintenanceType,
      interval_km: params.intervalKm ?? null, interval_days: params.intervalDays ?? null,
      last_service_date: params.lastServiceDate || null, last_service_odometer: params.lastServiceOdometer ?? null,
    });
    if (error) return { error: error.message };
    await load();
    return { error: null };
  }, [company, load]);

  const deactivateSchedule = useCallback(async (id: string) => {
    const { error } = await supabase.from('maintenance_schedules').update({ is_active: false }).eq('id', id);
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  return { schedules, loading, reload: load, createSchedule, deactivateSchedule };
}
