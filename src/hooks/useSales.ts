import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { offlineDb, isNetworkError, PendingSale } from '@/lib/offlineDb';

export interface Sale {
  id: string;
  invoice_no: string;
  customer_id: string | null;
  van_id: string | null;
  sale_type: 'cash' | 'credit' | 'pos';
  channel: 'van' | 'pos' | 'offline';
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  paid_amount: number;
  balance_amount: number;
  status: 'draft' | 'completed' | 'void';
  created_at: string;
  customer?: { id: string; business_name: string } | null;
  van?: { id: string; name: string } | null;
}

export interface CartItem {
  product_id: string;
  batch_id: string | null;
  product_name: string;
  unit_price: number;
  tax_rate: number;
  quantity: number;
  discount_pct: number;
  is_free_item: boolean;
  available: number; // van stock available, for client-side sanity check
}

export interface PaymentEntry {
  method: 'cash' | 'card' | 'bank' | 'upi' | 'wallet' | 'cheque';
  amount: number;
  reference_no?: string;
}

export function calculateCartTotals(items: CartItem[]) {
  let subtotal = 0, discount = 0, tax = 0;
  for (const it of items) {
    const price = it.is_free_item ? 0 : it.unit_price;
    const lineGross = price * it.quantity;
    const lineDiscount = it.is_free_item ? 0 : round2(lineGross * it.discount_pct / 100);
    const lineTax = round2((lineGross - lineDiscount) * it.tax_rate / 100);
    subtotal += lineGross;
    discount += lineDiscount;
    tax += lineTax;
  }
  return { subtotal: round2(subtotal), discount: round2(discount), tax: round2(tax), total: round2(subtotal - discount + tax) };
}
function round2(n: number) { return Math.round(n * 100) / 100; }

export function useSales() {
  const { company } = useAuth();
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data } = await supabase
      .from('sales')
      .select('*, customer:customers(id,business_name), van:vans(id,name)')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false })
      .limit(200);
    setLoading(false);
    setSales((data ?? []) as unknown as Sale[]);
  }, [company]);

  useEffect(() => { load(); }, [load]);

  return { sales, loading, reload: load };
}

export function useCreateSale() {
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const submit = useCallback(async (params: {
    customerId: string | null;
    vanId: string | null;
    saleType: 'cash' | 'credit' | 'pos';
    items: CartItem[];
    payments: PaymentEntry[];
  }): Promise<{ error: string | null; queued?: boolean; saleId?: string }> => {
    if (!user) return { error: 'Not signed in' };
    if (params.items.length === 0) return { error: 'Cart is empty' };

    const clientUuid = crypto.randomUUID();
    const payload = {
      p_customer_id: params.customerId,
      p_van_id: params.vanId,
      p_salesman_id: user.id,
      p_sale_type: params.saleType,
      p_items: params.items.map((it) => ({
        product_id: it.product_id, batch_id: it.batch_id, quantity: it.quantity,
        discount_pct: it.discount_pct, is_free_item: it.is_free_item,
      })),
      p_payments: params.payments.map((p) => ({ method: p.method, amount: p.amount, reference_no: p.reference_no ?? null })),
      p_client_uuid: clientUuid,
      p_latitude: null,
      p_longitude: null,
    };

    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('create_sale', payload);
      setSubmitting(false);
      if (error) return { error: error.message };
      return { error: null, saleId: data as string };
    } catch (err) {
      setSubmitting(false);
      if (isNetworkError(err)) {
        const pending: PendingSale = { client_uuid: clientUuid, payload, created_at: new Date().toISOString(), last_error: null };
        await offlineDb.pendingSales.put(pending);
        return { error: null, queued: true };
      }
      return { error: err instanceof Error ? err.message : 'Failed to create sale' };
    }
  }, [user]);

  return { submit, submitting };
}
