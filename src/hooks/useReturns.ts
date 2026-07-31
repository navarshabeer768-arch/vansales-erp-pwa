import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { offlineDb, isNetworkError, PendingReturn } from '@/lib/offlineDb';

export type ReturnType = 'sales_return' | 'purchase_return';

export interface ReturnRow {
  id: string;
  return_no: string;
  return_type: ReturnType;
  customer_id: string | null;
  supplier_id: string | null;
  location_type: 'warehouse' | 'van' | null;
  location_id: string | null;
  status: 'pending' | 'approved' | 'rejected';
  total_amount: number;
  created_at: string;
  customer?: { id: string; business_name: string } | null;
  supplier?: { id: string; name: string } | null;
}

export interface ReturnItemDraft {
  product_id: string;
  batch_id: string | null;
  quantity: number;
  unit_price: number;
}

export interface ReturnItemRow { product_id: string; quantity: number; unit_price: number; product?: { name: string } | null; }

export async function fetchReturnItems(returnId: string): Promise<ReturnItemRow[]> {
  const { data } = await supabase.from('return_items').select('product_id, quantity, unit_price, product:products(name)').eq('return_id', returnId);
  return (data ?? []) as unknown as ReturnItemRow[];
}

export function useReturns() {
  const { company, user } = useAuth();
  const [returns, setReturns] = useState<ReturnRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data } = await supabase
      .from('returns')
      .select('*, customer:customers(id,business_name), supplier:suppliers(id,name)')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false });
    setLoading(false);
    setReturns((data ?? []) as unknown as ReturnRow[]);
  }, [company]);

  useEffect(() => { load(); }, [load]);

  const createReturn = useCallback(async (params: {
    returnType: ReturnType;
    customerId?: string | null;
    supplierId?: string | null;
    locationType: 'warehouse' | 'van';
    locationId: string;
    items: ReturnItemDraft[];
  }): Promise<{ error: string | null; id?: string; queued?: boolean }> => {
    if (!company || !user) return { error: 'Missing context' };
    if (params.items.length === 0) return { error: 'Add at least one product.' };
    if (params.returnType === 'purchase_return' && params.locationType !== 'warehouse') {
      return { error: 'Purchase returns must come from a warehouse.' };
    }

    const clientUuid = crypto.randomUUID();
    const payload = {
      p_return_type: params.returnType, p_customer_id: params.customerId || null, p_supplier_id: params.supplierId || null,
      p_location_type: params.locationType, p_location_id: params.locationId,
      p_items: params.items.map((it) => ({ product_id: it.product_id, batch_id: it.batch_id, quantity: it.quantity, unit_price: it.unit_price })),
      p_client_uuid: clientUuid,
    };

    try {
      const { data, error } = await supabase.rpc('create_return_offline', payload);
      if (error) return { error: error.message };
      await load();
      return { error: null, id: data as string };
    } catch (err) {
      if (isNetworkError(err)) {
        const pending: PendingReturn = { client_uuid: clientUuid, payload, created_at: new Date().toISOString(), last_error: null };
        await offlineDb.pendingReturns.put(pending);
        return { error: null, queued: true };
      }
      return { error: err instanceof Error ? err.message : 'Failed to create return' };
    }
  }, [company, user, load]);

  const approveReturn = useCallback(async (returnId: string) => {
    if (!user) return { error: 'No user context' };
    const { error } = await supabase.rpc('approve_return', { p_return_id: returnId, p_approver_id: user.id });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [user, load]);

  return { returns, loading, reload: load, createReturn, approveReturn };
}
