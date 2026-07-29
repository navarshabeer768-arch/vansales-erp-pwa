import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { WarehouseStock, StockAdjustment, StockAdjustmentItem } from '@/types/database';

export function useWarehouseStock(warehouseId: string | null) {
  const { company } = useAuth();
  const [stock, setStock] = useState<WarehouseStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!company || !warehouseId) { setStock([]); setLoading(false); return; }
    setLoading(true);
    const { data, error: err } = await supabase
      .from('warehouse_stock')
      .select('*, product:products(id,name,sku), batch:batches(id,batch_no,expiry_date), location:warehouse_locations(id,code)')
      .eq('company_id', company.id)
      .eq('warehouse_id', warehouseId)
      .order('quantity', { ascending: true });
    setLoading(false);
    if (err) setError(err.message);
    else setStock((data ?? []) as unknown as WarehouseStock[]);
  }, [company, warehouseId]);

  useEffect(() => { load(); }, [load]);

  return { stock, loading, error, reload: load };
}

export interface AdjustmentDraftItem {
  product_id: string;
  batch_id: string | null;
  system_quantity: number;
  counted_quantity: number;
}

export function useStockAdjustments(warehouseId: string | null) {
  const { company, user } = useAuth();
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company || !warehouseId) { setAdjustments([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from('stock_adjustments')
      .select('*')
      .eq('company_id', company.id)
      .eq('location_type', 'warehouse')
      .eq('location_id', warehouseId)
      .order('created_at', { ascending: false });
    setLoading(false);
    setAdjustments((data ?? []) as StockAdjustment[]);
  }, [company, warehouseId]);

  useEffect(() => { load(); }, [load]);

  const createAdjustment = useCallback(async (
    adjustmentType: StockAdjustment['adjustment_type'],
    reason: string,
    items: AdjustmentDraftItem[]
  ) => {
    if (!company || !warehouseId || !user) return { error: 'Missing context' };
    if (items.length === 0) return { error: 'Add at least one item to adjust.' };

    const { data: adj, error: adjErr } = await supabase
      .from('stock_adjustments')
      .insert({
        company_id: company.id, location_type: 'warehouse', location_id: warehouseId,
        adjustment_type: adjustmentType, reason, created_by: user.id, status: 'pending',
      })
      .select('id')
      .single();
    if (adjErr || !adj) return { error: adjErr?.message ?? 'Failed to create adjustment' };

    const { error: itemsErr } = await supabase.from('stock_adjustment_items').insert(
      items.map((it) => ({
        adjustment_id: adj.id, product_id: it.product_id, batch_id: it.batch_id,
        system_quantity: it.system_quantity, counted_quantity: it.counted_quantity,
      }))
    );
    if (itemsErr) return { error: itemsErr.message };

    await load();
    return { error: null, id: adj.id as string };
  }, [company, warehouseId, user, load]);

  const approveAdjustment = useCallback(async (adjustmentId: string) => {
    if (!user) return { error: 'No user context' };
    const { error: err } = await supabase.rpc('approve_stock_adjustment', {
      p_adjustment_id: adjustmentId, p_approver_id: user.id,
    });
    if (!err) await load();
    return { error: err?.message ?? null };
  }, [user, load]);

  return { adjustments, loading, reload: load, createAdjustment, approveAdjustment };
}

export async function fetchAdjustmentItems(adjustmentId: string): Promise<StockAdjustmentItem[]> {
  const { data } = await supabase
    .from('stock_adjustment_items')
    .select('*, product:products(id,name,sku)')
    .eq('adjustment_id', adjustmentId);
  return (data ?? []) as unknown as StockAdjustmentItem[];
}
