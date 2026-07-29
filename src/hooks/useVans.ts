import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface Van {
  id: string;
  company_id: string;
  code: string;
  name: string;
  registration_no: string | null;
  vin_number: string | null;
  chassis_number: string | null;
  engine_number: string | null;
  vehicle_type: string | null;
  capacity: string | null;
  current_odometer: number | null;
  purchase_date: string | null;
  road_permit_no: string | null;
  permit_expiry: string | null;
  registration_expiry: string | null;
  notes: string | null;
  is_archived: boolean;
  insurance_expiry: string | null;
  home_warehouse_id: string | null;
  status: 'active' | 'maintenance' | 'inactive';
  created_at: string;
  updated_at: string;
  home_warehouse?: { id: string; name: string } | null;
}

export type VanInput = Omit<
  Van, 'id' | 'company_id' | 'created_at' | 'updated_at' | 'home_warehouse' | 'is_archived'
>;

const SELECT = '*, home_warehouse:warehouses(id,name)';

export function useVans() {
  const { company } = useAuth();
  const [vans, setVans] = useState<Van[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data, error: err } = await supabase
      .from('vans')
      .select(SELECT)
      .eq('company_id', company.id)
      .eq('is_archived', false)
      .order('name', { ascending: true });
    setLoading(false);
    if (err) setError(err.message);
    else setVans((data ?? []) as unknown as Van[]);
  }, [company]);

  useEffect(() => { load(); }, [load]);

  const createVan = useCallback(async (input: VanInput) => {
    if (!company) return { error: 'No company context' };
    const { error: err } = await supabase.from('vans').insert({ ...input, company_id: company.id });
    if (!err) await load();
    return { error: err ? (err.code === '23505' ? 'A van with this code already exists.' : err.message) : null };
  }, [company, load]);

  const updateVan = useCallback(async (id: string, input: Partial<VanInput>) => {
    const { error: err } = await supabase.from('vans').update(input).eq('id', id);
    if (!err) await load();
    return { error: err?.message ?? null };
  }, [load]);

  const deactivateVan = useCallback(async (id: string) => {
    const { error: err } = await supabase.from('vans').update({ status: 'inactive' }).eq('id', id);
    if (!err) await load();
    return { error: err?.message ?? null };
  }, [load]);

  const archiveVan = useCallback(async (id: string) => {
    const { error: err } = await supabase.from('vans').update({ is_archived: true }).eq('id', id);
    if (!err) await load();
    return { error: err?.message ?? null };
  }, [load]);

  const restoreVan = useCallback(async (id: string) => {
    const { error: err } = await supabase.from('vans').update({ is_archived: false }).eq('id', id);
    if (!err) await load();
    return { error: err?.message ?? null };
  }, [load]);

  return { vans, loading, error, reload: load, createVan, updateVan, deactivateVan, archiveVan, restoreVan };
}

export function useArchivedVans() {
  const { company } = useAuth();
  const [vans, setVans] = useState<Van[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data } = await supabase.from('vans').select(SELECT).eq('company_id', company.id).eq('is_archived', true).order('name');
    setVans((data ?? []) as unknown as Van[]);
    setLoading(false);
  }, [company]);

  useEffect(() => { load(); }, [load]);

  return { vans, loading, reload: load };
}

export function useSalesmenAndDrivers() {
  const { company } = useAuth();
  const [users, setUsers] = useState<{ id: string; full_name: string; role_code: string }[]>([]);

  useEffect(() => {
    if (!company) return;
    (async () => {
      const { data } = await supabase
        .from('app_users')
        .select('id, full_name, role:roles(code)')
        .eq('company_id', company.id)
        .eq('is_active', true);
      setUsers(
        (data ?? []).map((u: any) => ({ id: u.id, full_name: u.full_name, role_code: u.role?.code }))
      );
    })();
  }, [company]);

  return {
    drivers: users.filter((u) => u.role_code === 'driver'),
    salesmen: users.filter((u) => u.role_code === 'salesman' || u.role_code === 'van_sales_manager'),
  };
}
