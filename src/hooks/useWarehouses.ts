import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Warehouse } from '@/types/database';

export type WarehouseInput = Omit<Warehouse, 'id' | 'company_id' | 'created_at'>;

export function useWarehouses() {
  const { company } = useAuth();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data, error: err } = await supabase
      .from('warehouses')
      .select('*')
      .eq('company_id', company.id)
      .order('name', { ascending: true });
    setLoading(false);
    if (err) setError(err.message);
    else setWarehouses((data ?? []) as Warehouse[]);
  }, [company]);

  useEffect(() => { load(); }, [load]);

  const createWarehouse = useCallback(async (input: WarehouseInput) => {
    if (!company) return { error: 'No company context' };
    const { error: err } = await supabase.from('warehouses').insert({ ...input, company_id: company.id });
    if (!err) await load();
    return { error: err ? (err.code === '23505' ? 'A warehouse with this code already exists.' : err.message) : null };
  }, [company, load]);

  const updateWarehouse = useCallback(async (id: string, input: Partial<WarehouseInput>) => {
    const { error: err } = await supabase.from('warehouses').update(input).eq('id', id);
    if (!err) await load();
    return { error: err?.message ?? null };
  }, [load]);

  const deactivateWarehouse = useCallback(async (id: string) => {
    const { error: err } = await supabase.from('warehouses').update({ is_active: false }).eq('id', id);
    if (!err) await load();
    return { error: err?.message ?? null };
  }, [load]);

  return { warehouses, loading, error, reload: load, createWarehouse, updateWarehouse, deactivateWarehouse };
}
