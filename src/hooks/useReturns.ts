import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

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

function genReturnNo() {
  const now = new Date();
  const ym = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
  return `RTN-${ym}-${Math.floor(Math.random() * 900000 + 100000)}`;
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
  }) => {
    if (!company || !user) return { error: 'Missing context' };
    if (params.items.length === 0) return { error: 'Add at least one product.' };
    if (params.returnType === 'purchase_return' && params.locationType !== 'warehouse') {
      return { error: 'Purchase returns must come from a warehouse.' };
    }

    const totalAmount = params.items.reduce((sum, it) => sum + it.quantity * it.unit_price, 0);

    const { data: row, error: insertErr } = await supabase
      .from('returns')
      .insert({
        company_id: company.id, return_no: genReturnNo(), return_type: params.returnType,
        customer_id: params.customerId || null, supplier_id: params.supplierId || null,
        location_type: params.locationType, location_id: params.locationId,
        status: 'pending', note_type: params.returnType === 'sales_return' ? 'credit_note' : 'debit_note',
        total_amount: totalAmount, created_by: user.id,
      })
      .select('id')
      .single();
    if (insertErr || !row) return { error: insertErr?.message ?? 'Failed to create return' };

    const { error: itemsErr } = await supabase.from('return_items').insert(
      params.items.map((it) => ({
        return_id: row.id, product_id: it.product_id, batch_id: it.batch_id,
        quantity: it.quantity, unit_price: it.unit_price, line_total: it.quantity * it.unit_price,
      }))
    );
    if (itemsErr) return { error: itemsErr.message };

    await load();
    return { error: null, id: row.id as string };
  }, [company, user, load]);

  const approveReturn = useCallback(async (returnId: string) => {
    if (!user) return { error: 'No user context' };
    const { error } = await supabase.rpc('approve_return', { p_return_id: returnId, p_approver_id: user.id });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [user, load]);

  return { returns, loading, reload: load, createReturn, approveReturn };
}
