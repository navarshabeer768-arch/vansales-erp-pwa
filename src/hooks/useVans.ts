import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface Van {
  id: string;
  company_id: string;
  code: string;
  name: string;
  registration_no: string | null;
  insurance_expiry: string | null;
  home_warehouse_id: string | null;
  driver_id: string | null;
  salesman_id: string | null;
  status: 'active' | 'maintenance' | 'inactive';
  created_at: string;
  updated_at: string;
  home_warehouse?: { id: string; name: string } | null;
  driver?: { id: string; full_name: string } | null;
  salesman?: { id: string; full_name: string } | null;
}

export type VanInput = Omit<
  Van, 'id' | 'company_id' | 'created_at' | 'updated_at' | 'home_warehouse' | 'driver' | 'salesman'
>;

const SELECT = '*, home_warehouse:warehouses(id,name), driver:app_users!vans_driver_id_fkey(id,full_name), salesman:app_users!vans_salesman_id_fkey(id,full_name)';

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

  return { vans, loading, error, reload: load, createVan, updateVan, deactivateVan };
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
