import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface VanTransfer {
  id: string;
  transfer_no: string;
  from_van_id: string;
  to_van_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  is_emergency: boolean;
  received_by: string | null;
  received_at: string | null;
  created_at: string;
  from_van?: { id: string; name: string } | null;
  to_van?: { id: string; name: string } | null;
}

export interface VanTransferItemDraft { product_id: string; batch_id: string | null; quantity: number; }

export interface VanTransferItem extends VanTransferItemDraft {
  id: string;
  product?: { id: string; name: string; sku: string };
}

function genTransferNo() {
  const now = new Date();
  const ym = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
  return `VTR-${ym}-${Math.floor(Math.random() * 900000 + 100000)}`;
}

export function useVanTransfers() {
  const { company, user } = useAuth();
  const [transfers, setTransfers] = useState<VanTransfer[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data } = await supabase
      .from('van_transfers')
      .select('*, from_van:vans!van_transfers_from_van_id_fkey(id,name), to_van:vans!van_transfers_to_van_id_fkey(id,name)')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false });
    setTransfers((data ?? []) as unknown as VanTransfer[]);
    setLoading(false);
  }, [company]);

  useEffect(() => { load(); }, [load]);

  const createTransfer = useCallback(async (
    fromVanId: string, toVanId: string, items: VanTransferItemDraft[], isEmergency = false
  ) => {
    if (!company || !user) return { error: 'Missing context' };
    if (fromVanId === toVanId) return { error: 'Source and destination vans must be different.' };
    if (items.length === 0) return { error: 'Add at least one product.' };

    const { data: transfer, error: transferErr } = await supabase
      .from('van_transfers')
      .insert({
        company_id: company.id, transfer_no: genTransferNo(),
        from_van_id: fromVanId, to_van_id: toVanId, is_emergency: isEmergency, created_by: user.id,
      })
      .select('id')
      .single();
    if (transferErr || !transfer) return { error: transferErr?.message ?? 'Failed to create transfer' };

    const { error: itemsErr } = await supabase.from('van_transfer_items').insert(
      items.map((it) => ({ transfer_id: transfer.id, product_id: it.product_id, batch_id: it.batch_id, quantity: it.quantity }))
    );
    if (itemsErr) return { error: itemsErr.message };

    await load();
    return { error: null, id: transfer.id as string };
  }, [company, user, load]);

  const approveTransfer = useCallback(async (id: string) => {
    if (!user) return { error: 'No user context' };
    const { error } = await supabase.rpc('approve_van_transfer', { p_transfer_id: id, p_approver_id: user.id });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [user, load]);

  const markReceived = useCallback(async (id: string) => {
    const { error } = await supabase.rpc('mark_van_transfer_received', { p_transfer_id: id });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  return { transfers, loading, reload: load, createTransfer, approveTransfer, markReceived };
}

export async function fetchVanTransferItems(transferId: string): Promise<VanTransferItem[]> {
  const { data } = await supabase
    .from('van_transfer_items')
    .select('id, product_id, batch_id, quantity, product:products(id,name,sku)')
    .eq('transfer_id', transferId);
  return (data ?? []) as unknown as VanTransferItem[];
}
