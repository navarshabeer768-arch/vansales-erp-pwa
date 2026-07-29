import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Product } from '@/types/database';

export type ProductInput = Omit<Product, 'id' | 'company_id' | 'created_at' | 'updated_at' | 'category' | 'brand' | 'base_unit'>;

const SELECT = '*, category:categories(id,name), brand:brands(id,name), base_unit:units(id,name,symbol)';

export function useProducts() {
  const { company } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('products')
      .select(SELECT)
      .eq('company_id', company.id)
      .order('name', { ascending: true });
    setLoading(false);
    if (err) setError(err.message);
    else setProducts((data ?? []) as unknown as Product[]);
  }, [company]);

  useEffect(() => { load(); }, [load]);

  const createProduct = useCallback(async (input: ProductInput) => {
    if (!company) return { error: 'No company context', data: null };
    const { data, error: err } = await supabase
      .from('products')
      .insert({ ...input, company_id: company.id })
      .select(SELECT)
      .single();
    if (!err) await load();
    return { error: mapError(err), data };
  }, [company, load]);

  const updateProduct = useCallback(async (id: string, input: Partial<ProductInput>) => {
    const { error: err } = await supabase.from('products').update(input).eq('id', id);
    if (!err) await load();
    return { error: mapError(err) };
  }, [load]);

  const deactivateProduct = useCallback(async (id: string) => {
    // Products are never hard-deleted (referenced by historical sales/stock movements);
    // deactivation preserves referential integrity and audit history.
    const { error: err } = await supabase.from('products').update({ is_active: false }).eq('id', id);
    if (!err) await load();
    return { error: mapError(err) };
  }, [load]);

  const importProducts = useCallback(async (rows: ProductInput[]) => {
    if (!company) return { successCount: 0, errors: ['No company context'] };
    const errors: string[] = [];
    let successCount = 0;
    // Insert one at a time so a single bad row (duplicate SKU, bad unit)
    // doesn't abort the whole batch — matches how a real import wizard
    // should behave (report per-row failures, keep going).
    for (let i = 0; i < rows.length; i++) {
      const { error: err } = await supabase.from('products').insert({ ...rows[i], company_id: company.id });
      if (err) errors.push(`Row ${i + 2} (${rows[i].sku}): ${mapError(err)}`);
      else successCount++;
    }
    await load();
    return { successCount, errors };
  }, [company, load]);

  return { products, loading, error, reload: load, createProduct, updateProduct, deactivateProduct, importProducts };
}

function mapError(err: { message: string; code?: string } | null): string | null {
  if (!err) return null;
  if (err.code === '23505') {
    if (err.message.includes('sku')) return 'A product with this SKU already exists.';
    if (err.message.includes('barcode')) return 'A product with this barcode already exists.';
    return 'A duplicate record already exists.';
  }
  return err.message;
}
