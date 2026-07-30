import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface VanLoading {
  id: string;
  company_id: string;
  loading_no: string;
  van_id: string;
  warehouse_id: string;
  route_id: string | null;
  status: 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'reopened' | 'cancelled';
  signature_url: string | null;
  approval_notes: string | null;
  rejected_reason: string | null;
  cancel_reason: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  van?: { id: string; name: string; code: string } | null;
  warehouse?: { id: string; name: string } | null;
  route?: { id: string; name: string } | null;
}

export interface VanLoadingItemDraft {
  product_id: string;
  batch_id: string | null;
  quantity_requested: number;
}

export interface VanLoadingItemRow {
  id: string;
  loading_id: string;
  product_id: string;
  batch_id: string | null;
  quantity_requested: number;
  quantity_verified: number | null;
  picked_by: string | null;
  picked_at: string | null;
  remarks: string | null;
  product?: { id: string; name: string; sku: string } | null;
  batch?: { id: string; batch_no: string } | null;
}

export async function fetchLoadingItems(loadingId: string): Promise<VanLoadingItemRow[]> {
  const { data } = await supabase
    .from('van_loading_items')
    .select('*, product:products(id,name,sku), batch:batches(id,batch_no)')
    .eq('loading_id', loadingId);
  return (data ?? []) as unknown as VanLoadingItemRow[];
}

function genDocNo(prefix: string) {
  const now = new Date();
  const ym = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const rand = Math.floor(Math.random() * 900000 + 100000);
  return `${prefix}-${ym}-${rand}`;
}

export function useVanLoadings() {
  const { company, user } = useAuth();
  const [loadings, setLoadings] = useState<VanLoading[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data } = await supabase
      .from('van_loadings')
      .select('*, van:vans(id,name,code), warehouse:warehouses(id,name), route:routes(id,name)')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false });
    setLoading(false);
    setLoadings((data ?? []) as unknown as VanLoading[]);
  }, [company]);

  useEffect(() => { load(); }, [load]);

  const createLoading = useCallback(async (
    vanId: string, warehouseId: string, items: VanLoadingItemDraft[], routeId?: string
  ) => {
    if (!company || !user) return { error: 'Missing context' };
    if (items.length === 0) return { error: 'Add at least one product to the loading sheet.' };

    const { data: sheet, error: sheetErr } = await supabase
      .from('van_loadings')
      .insert({
        company_id: company.id, loading_no: genDocNo('LD'), van_id: vanId, warehouse_id: warehouseId,
        route_id: routeId || null, status: 'draft', created_by: user.id,
      })
      .select('id')
      .single();
    if (sheetErr || !sheet) return { error: sheetErr?.message ?? 'Failed to create loading sheet' };

    const { error: itemsErr } = await supabase.from('van_loading_items').insert(
      items.map((it) => ({
        loading_id: sheet.id, product_id: it.product_id, batch_id: it.batch_id,
        quantity_requested: it.quantity_requested, quantity_verified: it.quantity_requested,
      }))
    );
    if (itemsErr) return { error: itemsErr.message };

    await load();
    return { error: null, id: sheet.id as string };
  }, [company, user, load]);

  const submitLoading = useCallback(async (id: string, notes?: string) => {
    const { error } = await supabase.rpc('submit_van_loading', { p_loading_id: id, p_notes: notes ?? null });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  const rejectLoading = useCallback(async (id: string, reason: string) => {
    const { error } = await supabase.rpc('reject_van_loading', { p_loading_id: id, p_reason: reason });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  const reopenLoading = useCallback(async (id: string, notes?: string) => {
    const { error } = await supabase.rpc('reopen_van_loading', { p_loading_id: id, p_notes: notes ?? null });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  const cancelLoading = useCallback(async (id: string, reason: string) => {
    const { error } = await supabase.rpc('cancel_van_loading', { p_loading_id: id, p_reason: reason });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  const recordPick = useCallback(async (itemId: string, pickedQuantity: number) => {
    const { error } = await supabase.rpc('record_loading_pick', { p_item_id: itemId, p_picked_quantity: pickedQuantity });
    return { error: error?.message ?? null };
  }, []);

  const approveLoading = useCallback(async (loadingId: string, notes?: string, signatureUrl?: string) => {
    if (!user) return { error: 'No user context' };
    const { error } = await supabase.rpc('approve_van_loading', {
      p_loading_id: loadingId, p_approver_id: user.id, p_notes: notes ?? null, p_signature_url: signatureUrl ?? null,
    });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [user, load]);

  return {
    loadings, loading, reload: load, createLoading, approveLoading,
    submitLoading, rejectLoading, reopenLoading, cancelLoading, recordPick,
  };
}
