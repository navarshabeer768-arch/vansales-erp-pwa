import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface WarehouseTransfer {
  id: string;
  transfer_no: string;
  from_warehouse_id: string;
  to_warehouse_id: string;
  status: 'pending' | 'in_transit' | 'completed' | 'cancelled';
  created_at: string;
  completed_at: string | null;
  from_warehouse?: { id: string; name: string } | null;
  to_warehouse?: { id: string; name: string } | null;
}

export interface TransferItemDraft {
  product_id: string;
  batch_id: string | null;
  quantity: number;
}

export interface TransferItem extends TransferItemDraft {
  id: string;
  product?: { id: string; name: string; sku: string };
}

function genTransferNo() {
  const now = new Date();
  const ym = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
  return `TRF-${ym}-${Math.floor(Math.random() * 900000 + 100000)}`;
}

export function useWarehouseTransfers() {
  const { company, user } = useAuth();
  const [transfers, setTransfers] = useState<WarehouseTransfer[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data } = await supabase
      .from('warehouse_transfers')
      .select('*, from_warehouse:warehouses!warehouse_transfers_from_warehouse_id_fkey(id,name), to_warehouse:warehouses!warehouse_transfers_to_warehouse_id_fkey(id,name)')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false });
    setTransfers((data ?? []) as unknown as WarehouseTransfer[]);
    setLoading(false);
  }, [company]);

  useEffect(() => { load(); }, [load]);

  const createTransfer = useCallback(async (fromWarehouseId: string, toWarehouseId: string, items: TransferItemDraft[]) => {
    if (!company || !user) return { error: 'Missing context' };
    if (fromWarehouseId === toWarehouseId) return { error: 'Source and destination warehouses must be different.' };
    if (items.length === 0) return { error: 'Add at least one product.' };

    const { data: transfer, error: transferErr } = await supabase
      .from('warehouse_transfers')
      .insert({
        company_id: company.id, transfer_no: genTransferNo(),
        from_warehouse_id: fromWarehouseId, to_warehouse_id: toWarehouseId,
        status: 'pending', created_by: user.id,
      })
      .select('id')
      .single();
    if (transferErr || !transfer) return { error: transferErr?.message ?? 'Failed to create transfer' };

    const { error: itemsErr } = await supabase.from('warehouse_transfer_items').insert(
      items.map((it) => ({ transfer_id: transfer.id, product_id: it.product_id, batch_id: it.batch_id, quantity: it.quantity }))
    );
    if (itemsErr) return { error: itemsErr.message };

    await load();
    return { error: null, id: transfer.id as string };
  }, [company, user, load]);

  const approveTransfer = useCallback(async (transferId: string) => {
    if (!user) return { error: 'No user context' };
    const { error } = await supabase.rpc('approve_warehouse_transfer', { p_transfer_id: transferId, p_approver_id: user.id });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [user, load]);

  return { transfers, loading, reload: load, createTransfer, approveTransfer };
}

export async function fetchTransferItems(transferId: string): Promise<TransferItem[]> {
  const { data } = await supabase
    .from('warehouse_transfer_items')
    .select('id, product_id, batch_id, quantity, product:products(id,name,sku)')
    .eq('transfer_id', transferId);
  return (data ?? []) as unknown as TransferItem[];
}
