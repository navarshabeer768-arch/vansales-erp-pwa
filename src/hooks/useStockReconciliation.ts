import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface StockReconciliationRow {
  id: string;
  operation_id: string;
  van_id: string;
  product_id: string;
  batch_id: string | null;
  system_quantity: number;
  physical_quantity: number;
  difference_quantity: number;
  difference_value: number;
  reason: string | null;
  status: 'pending' | 'approved';
  approved_at: string | null;
  created_at: string;
  van?: { id: string; name: string } | null;
  product?: { id: string; name: string; sku: string } | null;
  batch?: { id: string; batch_no: string } | null;
}

export interface ReconciliationItemDraft {
  product_id: string;
  batch_id: string | null;
  physical_quantity: number;
  reason?: string;
}

export function useStockReconciliation(operationId: string | null) {
  const { company } = useAuth();
  const [rows, setRows] = useState<StockReconciliationRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    let query = supabase
      .from('stock_reconciliation')
      .select('*, van:vans(id,name), product:products(id,name,sku), batch:batches(id,batch_no)')
      .eq('company_id', company.id);
    if (operationId) query = query.eq('operation_id', operationId);
    const { data } = await query.order('created_at', { ascending: false });
    setRows((data ?? []) as unknown as StockReconciliationRow[]);
    setLoading(false);
  }, [company, operationId]);

  useEffect(() => { load(); }, [load]);

  const submit = useCallback(async (opId: string, items: ReconciliationItemDraft[]) => {
    if (items.length === 0) return { error: 'Add at least one counted product.' };
    const { error } = await supabase.rpc('submit_stock_reconciliation', {
      p_operation_id: opId,
      p_items: items.map((i) => ({ product_id: i.product_id, batch_id: i.batch_id, physical_quantity: i.physical_quantity, reason: i.reason ?? null })),
    });
    if (error) return { error: error.message };
    await load();
    return { error: null };
  }, [load]);

  const approve = useCallback(async (id: string) => {
    const { error } = await supabase.rpc('approve_stock_reconciliation', { p_reconciliation_id: id });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  return { rows, loading, reload: load, submit, approve };
}
