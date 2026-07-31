import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface CustomerProductPrice {
  id: string; customer_id: string; product_id: string; price: number;
  min_selling_price: number | null; max_discount_pct: number | null;
  effective_date: string | null; expiry_date: string | null; is_active: boolean;
  product?: { id: string; name: string; sku: string } | null;
}

export function useCustomerProductPrices(customerId: string | null) {
  const { company } = useAuth();
  const [prices, setPrices] = useState<CustomerProductPrice[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company || !customerId) { setPrices([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase.from('customer_product_prices').select('*, product:products(id,name,sku)').eq('customer_id', customerId).eq('is_active', true);
    setPrices((data ?? []) as unknown as CustomerProductPrice[]);
    setLoading(false);
  }, [company, customerId]);

  useEffect(() => { load(); }, [load]);

  const create = useCallback(async (input: { productId: string; price: number; minSellingPrice?: number; maxDiscountPct?: number; effectiveDate?: string; expiryDate?: string }) => {
    if (!company || !customerId) return { error: 'Missing context' };
    const { error } = await supabase.from('customer_product_prices').upsert({
      company_id: company.id, customer_id: customerId, product_id: input.productId, price: input.price,
      min_selling_price: input.minSellingPrice ?? null, max_discount_pct: input.maxDiscountPct ?? null,
      effective_date: input.effectiveDate || null, expiry_date: input.expiryDate || null, is_active: true,
    }, { onConflict: 'customer_id,product_id' });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [company, customerId, load]);

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase.from('customer_product_prices').update({ is_active: false }).eq('id', id);
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  return { prices, loading, create, remove, reload: load };
}

export type DiscountType = 'percentage' | 'fixed' | 'product' | 'category' | 'invoice';

export interface CustomerDiscount {
  id: string; customer_id: string; discount_type: DiscountType; product_id: string | null; category_id: string | null;
  discount_value: number; maximum_discount: number | null; requires_approval: boolean; is_temporary: boolean;
  expiry_date: string | null; status: 'active' | 'pending_approval' | 'expired' | 'cancelled';
  product?: { name: string } | null; category?: { name: string } | null;
}

export function useCustomerDiscounts(customerId: string | null) {
  const { company } = useAuth();
  const [discounts, setDiscounts] = useState<CustomerDiscount[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company || !customerId) { setDiscounts([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase.from('customer_discounts').select('*, product:products(name), category:categories(name)').eq('customer_id', customerId).order('created_at', { ascending: false });
    setDiscounts((data ?? []) as unknown as CustomerDiscount[]);
    setLoading(false);
  }, [company, customerId]);

  useEffect(() => { load(); }, [load]);

  const create = useCallback(async (input: {
    discountType: DiscountType; discountValue: number; productId?: string; categoryId?: string;
    maximumDiscount?: number; requiresApproval?: boolean; isTemporary?: boolean; expiryDate?: string;
  }) => {
    if (!company || !customerId) return { error: 'Missing context' };
    const { error } = await supabase.from('customer_discounts').insert({
      company_id: company.id, customer_id: customerId, discount_type: input.discountType, discount_value: input.discountValue,
      product_id: input.productId || null, category_id: input.categoryId || null, maximum_discount: input.maximumDiscount ?? null,
      requires_approval: input.requiresApproval ?? false, is_temporary: input.isTemporary ?? false, expiry_date: input.expiryDate || null,
      status: input.requiresApproval ? 'pending_approval' : 'active',
    });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [company, customerId, load]);

  const approve = useCallback(async (id: string) => {
    const { error } = await supabase.from('customer_discounts').update({ status: 'active' }).eq('id', id);
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  const cancel = useCallback(async (id: string) => {
    const { error } = await supabase.from('customer_discounts').update({ status: 'cancelled' }).eq('id', id);
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  return { discounts, loading, create, approve, cancel, reload: load };
}

export interface FreeQuantityRule {
  id: string; name: string; buy_product_id: string; buy_quantity: number; free_product_id: string; free_quantity: number;
  customer_id: string | null; price_list_id: string | null; effective_date: string | null; expiry_date: string | null; is_active: boolean;
  buy_product?: { name: string } | null; free_product?: { name: string } | null;
}

export function useFreeQuantityRules(customerId?: string | null) {
  const { company } = useAuth();
  const [rules, setRules] = useState<FreeQuantityRule[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    let query = supabase.from('free_quantity_rules').select('*, buy_product:products!free_quantity_rules_buy_product_id_fkey(name), free_product:products!free_quantity_rules_free_product_id_fkey(name)').eq('company_id', company.id).eq('is_active', true);
    if (customerId) query = query.or(`customer_id.eq.${customerId},customer_id.is.null`);
    const { data } = await query;
    setRules((data ?? []) as unknown as FreeQuantityRule[]);
    setLoading(false);
  }, [company, customerId]);

  useEffect(() => { load(); }, [load]);

  const create = useCallback(async (input: {
    name: string; buyProductId: string; buyQuantity: number; freeProductId: string; freeQuantity: number;
    customerId?: string; priceListId?: string; effectiveDate?: string; expiryDate?: string;
  }) => {
    if (!company) return { error: 'No company context' };
    const { error } = await supabase.from('free_quantity_rules').insert({
      company_id: company.id, name: input.name, buy_product_id: input.buyProductId, buy_quantity: input.buyQuantity,
      free_product_id: input.freeProductId, free_quantity: input.freeQuantity, customer_id: input.customerId || null,
      price_list_id: input.priceListId || null, effective_date: input.effectiveDate || null, expiry_date: input.expiryDate || null,
    });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [company, load]);

  const deactivate = useCallback(async (id: string) => {
    const { error } = await supabase.from('free_quantity_rules').update({ is_active: false }).eq('id', id);
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  return { rules, loading, create, deactivate, reload: load };
}
