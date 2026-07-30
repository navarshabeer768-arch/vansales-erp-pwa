import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface VanUnloading {
  id: string;
  company_id: string;
  unloading_no: string;
  van_id: string;
  warehouse_id: string;
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
}

export type UnloadingItemType = 'remaining' | 'damaged' | 'expired' | 'customer_return';

export interface VanUnloadingItemDraft {
  product_id: string;
  batch_id: string | null;
  item_type: UnloadingItemType;
  quantity: number;
  system_quantity: number;
  variance_reason?: string;
}

export interface VanUnloadingItemRow {
  id: string;
  unloading_id: string;
  product_id: string;
  batch_id: string | null;
  item_type: UnloadingItemType;
  quantity: number;
  system_quantity: number | null;
  difference: number | null;
  variance_reason: string | null;
  product?: { id: string; name: string; sku: string } | null;
  batch?: { id: string; batch_no: string } | null;
}

export async function fetchUnloadingItems(unloadingId: string): Promise<VanUnloadingItemRow[]> {
  const { data } = await supabase
    .from('van_unloading_items')
    .select('*, product:products(id,name,sku), batch:batches(id,batch_no)')
    .eq('unloading_id', unloadingId);
  return (data ?? []) as unknown as VanUnloadingItemRow[];
}

function genDocNo(prefix: string) {
  const now = new Date();
  const ym = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const rand = Math.floor(Math.random() * 900000 + 100000);
  return `${prefix}-${ym}-${rand}`;
}

export function useVanUnloadings() {
  const { company, user } = useAuth();
  const [unloadings, setUnloadings] = useState<VanUnloading[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data } = await supabase
      .from('van_unloadings')
      .select('*, van:vans(id,name,code), warehouse:warehouses(id,name)')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false });
    setLoading(false);
    setUnloadings((data ?? []) as unknown as VanUnloading[]);
  }, [company]);

  useEffect(() => { load(); }, [load]);

  const createUnloading = useCallback(async (
    vanId: string, warehouseId: string, items: VanUnloadingItemDraft[]
  ) => {
    if (!company || !user) return { error: 'Missing context' };
    const nonZero = items.filter((it) => it.quantity > 0);
    if (nonZero.length === 0) return { error: 'Enter at least one non-zero quantity.' };

    const { data: sheet, error: sheetErr } = await supabase
      .from('van_unloadings')
      .insert({
        company_id: company.id, unloading_no: genDocNo('UL'), van_id: vanId, warehouse_id: warehouseId,
        status: 'pending_approval', created_by: user.id,
      })
      .select('id')
      .single();
    if (sheetErr || !sheet) return { error: sheetErr?.message ?? 'Failed to create unloading sheet' };

    const { error: itemsErr } = await supabase.from('van_unloading_items').insert(
      nonZero.map((it) => ({
        unloading_id: sheet.id, product_id: it.product_id, batch_id: it.batch_id,
        item_type: it.item_type, quantity: it.quantity, system_quantity: it.system_quantity,
        variance_reason: it.variance_reason || null,
      }))
    );
    if (itemsErr) return { error: itemsErr.message };

    await load();
    return { error: null, id: sheet.id as string };
  }, [company, user, load]);

  const submitUnloading = useCallback(async (id: string, notes?: string) => {
    const { error } = await supabase.rpc('submit_van_unloading', { p_unloading_id: id, p_notes: notes ?? null });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  const rejectUnloading = useCallback(async (id: string, reason: string) => {
    const { error } = await supabase.rpc('reject_van_unloading', { p_unloading_id: id, p_reason: reason });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  const reopenUnloading = useCallback(async (id: string, notes?: string) => {
    const { error } = await supabase.rpc('reopen_van_unloading', { p_unloading_id: id, p_notes: notes ?? null });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  const cancelUnloading = useCallback(async (id: string, reason: string) => {
    const { error } = await supabase.rpc('cancel_van_unloading', { p_unloading_id: id, p_reason: reason });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  const approveUnloading = useCallback(async (unloadingId: string, notes?: string, signatureUrl?: string) => {
    if (!user) return { error: 'No user context' };
    const { error } = await supabase.rpc('approve_van_unloading', {
      p_unloading_id: unloadingId, p_approver_id: user.id, p_notes: notes ?? null, p_signature_url: signatureUrl ?? null,
    });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [user, load]);

  return {
    unloadings, loading, reload: load, createUnloading, approveUnloading,
    submitUnloading, rejectUnloading, reopenUnloading, cancelUnloading,
  };
}

/** Current van stock, used to prefill both loading verification and unloading defaults. */
export function useVanStock(vanId: string | null) {
  const { company } = useAuth();
  const [stock, setStock] = useState<{
    id: string; product_id: string; batch_id: string | null; quantity: number;
    product?: { id: string; name: string; sku: string; barcode: string | null };
    batch?: { id: string; batch_no: string; expiry_date: string | null } | null;
  }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company || !vanId) { setStock([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from('van_stock')
      .select('id, product_id, batch_id, quantity, product:products(id,name,sku,barcode), batch:batches(id,batch_no,expiry_date)')
      .eq('company_id', company.id)
      .eq('van_id', vanId)
      .gt('quantity', 0);
    setLoading(false);
    setStock((data ?? []) as any);
  }, [company, vanId]);

  useEffect(() => { load(); }, [load]);

  return { stock, loading, reload: load };
}
