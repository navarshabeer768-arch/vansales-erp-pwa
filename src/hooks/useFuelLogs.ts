import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export type FuelType = 'petrol' | 'diesel' | 'cng' | 'electric';

export interface FuelLog {
  id: string;
  van_id: string;
  fuel_date: string;
  fuel_type: FuelType;
  quantity: number;
  cost: number;
  odometer_reading: number;
  vendor: string | null;
  notes: string | null;
  created_at: string;
  van?: { id: string; name: string; code: string } | null;
}

export function useFuelLogs(vanId: string | null) {
  const { company } = useAuth();
  const [logs, setLogs] = useState<FuelLog[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    let query = supabase.from('fuel_logs').select('*, van:vans(id,name,code)').eq('company_id', company.id);
    if (vanId) query = query.eq('van_id', vanId);
    const { data } = await query.order('fuel_date', { ascending: false });
    setLogs((data ?? []) as unknown as FuelLog[]);
    setLoading(false);
  }, [company, vanId]);

  useEffect(() => { load(); }, [load]);

  const createLog = useCallback(async (params: {
    vanId: string; fuelDate: string; fuelType: FuelType; quantity: number; cost: number;
    odometerReading: number; vendor?: string; notes?: string;
  }) => {
    if (!company) return { error: 'No company context' };
    const { error } = await supabase.from('fuel_logs').insert({
      company_id: company.id, van_id: params.vanId, fuel_date: params.fuelDate, fuel_type: params.fuelType,
      quantity: params.quantity, cost: params.cost, odometer_reading: params.odometerReading,
      vendor: params.vendor || null, notes: params.notes || null,
    });
    if (error) return { error: error.message };
    await load();
    return { error: null };
  }, [company, load]);

  const deleteLog = useCallback(async (id: string) => {
    const { error } = await supabase.from('fuel_logs').delete().eq('id', id);
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  return { logs, loading, reload: load, createLog, deleteLog };
}

export interface FuelMileageRow {
  fuel_log_id: string;
  fuel_date: string;
  quantity: number;
  cost: number;
  odometer_reading: number;
  distance_since_last: number | null;
  mileage: number | null;
}

export function useFuelMileage(vanId: string | null) {
  const [rows, setRows] = useState<FuelMileageRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!vanId) { setRows([]); setLoading(false); return; }
    setLoading(true);
    supabase.rpc('van_fuel_mileage', { p_van_id: vanId }).then(({ data }) => {
      setRows((data ?? []) as FuelMileageRow[]);
      setLoading(false);
    });
  }, [vanId]);

  const avgMileage = rows.filter((r) => r.mileage !== null && r.mileage > 0);
  const averageMileage = avgMileage.length > 0 ? avgMileage.reduce((s, r) => s + (r.mileage ?? 0), 0) / avgMileage.length : null;

  return { rows, loading, averageMileage };
}
