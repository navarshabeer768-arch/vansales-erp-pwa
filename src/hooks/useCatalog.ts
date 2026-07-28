import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Category, Brand, Unit, Supplier } from '@/types/database';

/** Generic loader for simple company-scoped reference tables. */
function useReferenceTable<T extends { id: string }>(table: string, orderBy = 'name') {
  const { company } = useAuth();
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data, error: err } = await supabase
      .from(table)
      .select('*')
      .eq('company_id', company.id)
      .order(orderBy, { ascending: true });
    setLoading(false);
    if (err) setError(err.message);
    else setRows((data ?? []) as T[]);
  }, [company, table, orderBy]);

  useEffect(() => { load(); }, [load]);

  const create = useCallback(async (payload: Partial<T>) => {
    if (!company) return { error: 'No company context' };
    const { error: err } = await supabase.from(table).insert({ ...payload, company_id: company.id });
    if (!err) await load();
    return { error: err?.message ?? null };
  }, [company, table, load]);

  const update = useCallback(async (id: string, payload: Partial<T>) => {
    const { error: err } = await supabase.from(table).update(payload as Record<string, unknown>).eq('id', id);
    if (!err) await load();
    return { error: err?.message ?? null };
  }, [table, load]);

  const remove = useCallback(async (id: string) => {
    const { error: err } = await supabase.from(table).delete().eq('id', id);
    if (!err) await load();
    return { error: err?.message ?? null };
  }, [table, load]);

  return { rows, loading, error, reload: load, create, update, remove };
}

export const useCategories = () => useReferenceTable<Category>('categories');
export const useBrands = () => useReferenceTable<Brand>('brands');
export const useUnits = () => useReferenceTable<Unit>('units');
export const useSuppliers = () => useReferenceTable<Supplier>('suppliers');
