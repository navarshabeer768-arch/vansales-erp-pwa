import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface LookupItem { id: string; code: string; label: string; is_system: boolean; is_active: boolean; }

function useConfigurableLookup(table: 'customer_types' | 'customer_categories' | 'customer_channels') {
  const { company } = useAuth();
  const [items, setItems] = useState<LookupItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data } = await supabase
      .from(table).select('id, code, label, is_system, is_active')
      .or(`company_id.is.null,company_id.eq.${company.id}`)
      .eq('is_active', true)
      .order('is_system', { ascending: false });
    setItems((data ?? []) as LookupItem[]);
    setLoading(false);
  }, [company, table]);

  useEffect(() => { load(); }, [load]);

  const addCustom = useCallback(async (code: string, label: string) => {
    if (!company) return { error: 'No company context' };
    const { error } = await supabase.from(table).insert({ code, company_id: company.id, label, is_system: false });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [company, table, load]);

  const deactivate = useCallback(async (id: string) => {
    const { error } = await supabase.from(table).update({ is_active: false }).eq('id', id);
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [table, load]);

  return { items, loading, addCustom, deactivate, reload: load };
}

export function useCustomerTypes() { return useConfigurableLookup('customer_types'); }
export function useCustomerCategories() { return useConfigurableLookup('customer_categories'); }
export function useCustomerChannels() { return useConfigurableLookup('customer_channels'); }

export interface Territory { id: string; name: string; is_active: boolean; }

export function useTerritories() {
  const { company } = useAuth();
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data } = await supabase.from('territories').select('id, name, is_active').eq('company_id', company.id).eq('is_active', true).order('name');
    setTerritories((data ?? []) as Territory[]);
    setLoading(false);
  }, [company]);

  useEffect(() => { load(); }, [load]);

  const create = useCallback(async (name: string) => {
    if (!company) return { error: 'No company context' };
    const { error } = await supabase.from('territories').insert({ company_id: company.id, name });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [company, load]);

  const deactivate = useCallback(async (id: string) => {
    const { error } = await supabase.from('territories').update({ is_active: false }).eq('id', id);
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  return { territories, loading, create, deactivate, reload: load };
}

export interface CustomerTag { id: string; name: string; }

export function useCustomerTags() {
  const { company } = useAuth();
  const [tags, setTags] = useState<CustomerTag[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data } = await supabase.from('customer_tags').select('id, name').eq('company_id', company.id).order('name');
    setTags((data ?? []) as CustomerTag[]);
    setLoading(false);
  }, [company]);

  useEffect(() => { load(); }, [load]);

  const create = useCallback(async (name: string) => {
    if (!company) return { error: 'No company context', id: null };
    const { data, error } = await supabase.from('customer_tags').insert({ company_id: company.id, name }).select('id').single();
    if (!error) await load();
    return { error: error?.message ?? null, id: data?.id as string | undefined };
  }, [company, load]);

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase.from('customer_tags').delete().eq('id', id);
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  return { tags, loading, create, remove, reload: load };
}

export interface CustomerGroup { id: string; code: string | null; name: string; default_discount_pct: number; is_active: boolean; }

export function useCustomerGroups() {
  const { company } = useAuth();
  const [groups, setGroups] = useState<CustomerGroup[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data } = await supabase.from('customer_groups').select('id, code, name, default_discount_pct, is_active').eq('company_id', company.id).eq('is_active', true).order('name');
    setGroups((data ?? []) as CustomerGroup[]);
    setLoading(false);
  }, [company]);

  useEffect(() => { load(); }, [load]);

  const create = useCallback(async (name: string, defaultDiscountPct: number, code?: string) => {
    if (!company) return { error: 'No company context' };
    const { error } = await supabase.from('customer_groups').insert({ company_id: company.id, name, default_discount_pct: defaultDiscountPct, code: code || null });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [company, load]);

  const deactivate = useCallback(async (id: string) => {
    const { error } = await supabase.from('customer_groups').update({ is_active: false }).eq('id', id);
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  return { groups, loading, create, deactivate, reload: load };
}
