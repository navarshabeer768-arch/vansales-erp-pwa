import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface PriceList {
  id: string; code: string; name: string; currency: string; priority: number;
  status: 'active' | 'inactive' | 'expired'; effective_date: string | null; expiry_date: string | null;
  branch_id: string | null; notes: string | null;
  branch?: { name: string } | null;
}

export function usePriceLists() {
  const { company } = useAuth();
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data } = await supabase.from('price_lists').select('*, branch:warehouses(name)').eq('company_id', company.id).order('priority');
    setPriceLists((data ?? []) as unknown as PriceList[]);
    setLoading(false);
  }, [company]);

  useEffect(() => { load(); }, [load]);

  const create = useCallback(async (input: {
    code: string; name: string; currency: string; priority: number; effectiveDate?: string; expiryDate?: string; branchId?: string; notes?: string;
  }) => {
    if (!company) return { error: 'No company context' };
    const { error } = await supabase.from('price_lists').insert({
      company_id: company.id, code: input.code, name: input.name, currency: input.currency, priority: input.priority,
      effective_date: input.effectiveDate || null, expiry_date: input.expiryDate || null, branch_id: input.branchId || null, notes: input.notes || null,
    });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [company, load]);

  const updateStatus = useCallback(async (id: string, status: PriceList['status']) => {
    const { error } = await supabase.from('price_lists').update({ status }).eq('id', id);
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  return { priceLists, loading, create, updateStatus, reload: load };
}

export interface ProductPriceRule {
  id: string; product_id: string; scope_type: 'price_list' | 'branch' | 'route' | 'promotion';
  price_list_id: string | null; branch_id: string | null; route_id: string | null;
  price: number; min_selling_price: number | null; max_discount_pct: number | null;
  effective_date: string | null; expiry_date: string | null; priority: number; is_active: boolean;
  product?: { id: string; name: string; sku: string } | null;
}

export function useProductPriceRules(filter: { priceListId?: string; branchId?: string; routeId?: string; scopeType?: string }) {
  const { company } = useAuth();
  const [rules, setRules] = useState<ProductPriceRule[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    let query = supabase.from('product_price_rules').select('*, product:products(id,name,sku)').eq('company_id', company.id).eq('is_active', true);
    if (filter.priceListId) query = query.eq('price_list_id', filter.priceListId);
    if (filter.branchId) query = query.eq('branch_id', filter.branchId);
    if (filter.routeId) query = query.eq('route_id', filter.routeId);
    if (filter.scopeType) query = query.eq('scope_type', filter.scopeType);
    const { data } = await query;
    setRules((data ?? []) as unknown as ProductPriceRule[]);
    setLoading(false);
  }, [company, JSON.stringify(filter)]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  const create = useCallback(async (input: {
    productId: string; scopeType: ProductPriceRule['scope_type']; priceListId?: string; branchId?: string; routeId?: string;
    price: number; minSellingPrice?: number; maxDiscountPct?: number; effectiveDate?: string; expiryDate?: string; priority?: number;
  }) => {
    if (!company) return { error: 'No company context' };
    const { error } = await supabase.from('product_price_rules').insert({
      company_id: company.id, product_id: input.productId, scope_type: input.scopeType,
      price_list_id: input.priceListId || null, branch_id: input.branchId || null, route_id: input.routeId || null,
      price: input.price, min_selling_price: input.minSellingPrice ?? null, max_discount_pct: input.maxDiscountPct ?? null,
      effective_date: input.effectiveDate || null, expiry_date: input.expiryDate || null, priority: input.priority ?? 0,
    });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [company, load]);

  const deactivate = useCallback(async (id: string) => {
    const { error } = await supabase.from('product_price_rules').update({ is_active: false }).eq('id', id);
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  return { rules, loading, create, deactivate, reload: load };
}

export interface CustomerPriceListAssignment {
  id: string; customer_id: string; price_list_id: string;
  assignment_type: 'default' | 'secondary' | 'temporary'; priority: number;
  effective_date: string | null; expiry_date: string | null;
  price_list?: { id: string; name: string } | null;
}

export function useCustomerPriceLists(customerId: string | null) {
  const { company } = useAuth();
  const [assignments, setAssignments] = useState<CustomerPriceListAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company || !customerId) { setAssignments([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase.from('customer_price_lists').select('*, price_list:price_lists(id,name)').eq('customer_id', customerId);
    setAssignments((data ?? []) as unknown as CustomerPriceListAssignment[]);
    setLoading(false);
  }, [company, customerId]);

  useEffect(() => { load(); }, [load]);

  const assign = useCallback(async (priceListId: string, assignmentType: CustomerPriceListAssignment['assignment_type'], expiryDate?: string) => {
    if (!company || !customerId) return { error: 'Missing context' };
    const { error } = await supabase.from('customer_price_lists').insert({
      company_id: company.id, customer_id: customerId, price_list_id: priceListId, assignment_type: assignmentType, expiry_date: expiryDate || null,
    });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [company, customerId, load]);

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase.from('customer_price_lists').delete().eq('id', id);
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  return { assignments, loading, assign, remove, reload: load };
}
