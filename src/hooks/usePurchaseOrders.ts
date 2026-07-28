import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface PurchaseOrder {
  id: string;
  po_no: string;
  supplier_id: string;
  warehouse_id: string;
  status: 'draft' | 'sent' | 'partially_received' | 'received' | 'cancelled';
  total_amount: number;
  created_at: string;
  supplier?: { id: string; name: string } | null;
  warehouse?: { id: string; name: string } | null;
}

export interface PoItemDraft {
  product_id: string;
  quantity: number;
  unit_cost: number;
}

export interface PoItem extends PoItemDraft {
  id: string;
  received_quantity: number;
  product?: { id: string; name: string; sku: string };
}

function genPoNo() {
  const now = new Date();
  const ym = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
  return `PO-${ym}-${Math.floor(Math.random() * 900000 + 100000)}`;
}

export function usePurchaseOrders() {
  const { company, user } = useAuth();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data } = await supabase
      .from('purchase_orders')
      .select('*, supplier:suppliers(id,name), warehouse:warehouses(id,name)')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false });
    setLoading(false);
    setOrders((data ?? []) as unknown as PurchaseOrder[]);
  }, [company]);

  useEffect(() => { load(); }, [load]);

  const createOrder = useCallback(async (supplierId: string, warehouseId: string, items: PoItemDraft[]) => {
    if (!company || !user) return { error: 'Missing context' };
    if (items.length === 0) return { error: 'Add at least one product.' };
    const totalAmount = items.reduce((sum, it) => sum + it.quantity * it.unit_cost, 0);

    const { data: po, error: poErr } = await supabase
      .from('purchase_orders')
      .insert({
        company_id: company.id, po_no: genPoNo(), supplier_id: supplierId, warehouse_id: warehouseId,
        status: 'sent', total_amount: totalAmount, created_by: user.id,
      })
      .select('id')
      .single();
    if (poErr || !po) return { error: poErr?.message ?? 'Failed to create purchase order' };

    const { error: itemsErr } = await supabase.from('purchase_order_items').insert(
      items.map((it) => ({ po_id: po.id, product_id: it.product_id, quantity: it.quantity, unit_cost: it.unit_cost }))
    );
    if (itemsErr) return { error: itemsErr.message };

    await load();
    return { error: null, id: po.id as string };
  }, [company, user, load]);

  return { orders, loading, reload: load, createOrder };
}

export async function fetchPoItems(poId: string): Promise<PoItem[]> {
  const { data } = await supabase
    .from('purchase_order_items')
    .select('*, product:products(id,name,sku)')
    .eq('po_id', poId);
  return (data ?? []) as unknown as PoItem[];
}
