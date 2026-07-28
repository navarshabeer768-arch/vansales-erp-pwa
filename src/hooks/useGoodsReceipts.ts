import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface GoodsReceipt {
  id: string;
  grn_no: string;
  po_id: string | null;
  supplier_id: string;
  warehouse_id: string;
  supplier_invoice_no: string | null;
  created_at: string;
  supplier?: { id: string; name: string } | null;
  warehouse?: { id: string; name: string } | null;
}

export interface ReceiveItemDraft {
  product_id: string;
  batch_id: string | null;
  batch_no?: string;
  expiry_date?: string;
  quantity: number;
  unit_cost: number;
}

export function useGoodsReceipts() {
  const { company } = useAuth();
  const [receipts, setReceipts] = useState<GoodsReceipt[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data } = await supabase
      .from('goods_receipts')
      .select('*, supplier:suppliers(id,name), warehouse:warehouses(id,name)')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false });
    setLoading(false);
    setReceipts((data ?? []) as unknown as GoodsReceipt[]);
  }, [company]);

  useEffect(() => { load(); }, [load]);

  const receiveGoods = useCallback(async (params: {
    warehouseId: string; supplierId: string; poId?: string | null;
    supplierInvoiceNo?: string; items: ReceiveItemDraft[];
  }) => {
    if (params.items.length === 0) return { error: 'Add at least one product.' };
    const { data, error } = await supabase.rpc('receive_goods', {
      p_warehouse_id: params.warehouseId,
      p_supplier_id: params.supplierId,
      p_po_id: params.poId ?? null,
      p_supplier_invoice_no: params.supplierInvoiceNo ?? null,
      p_items: params.items.map((it) => ({
        product_id: it.product_id, batch_id: it.batch_id, batch_no: it.batch_no ?? null,
        expiry_date: it.expiry_date ?? null, quantity: it.quantity, unit_cost: it.unit_cost,
      })),
    });
    if (error) return { error: error.message };
    await load();
    return { error: null, id: data as string };
  }, [load]);

  return { receipts, loading, reload: load, receiveGoods };
}
