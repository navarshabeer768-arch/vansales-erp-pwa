import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface ProductVariant {
  id: string;
  product_id: string;
  variant_name: string;
  sku_suffix: string | null;
  price_delta: number;
  selling_price_override: number | null;
  cost_price: number | null;
  barcode: string | null;
  image_url: string | null;
  is_active: boolean;
}

export function useProductVariants(productId: string | null) {
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!productId) { setVariants([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase.from('product_variants').select('*').eq('product_id', productId).order('variant_name');
    setVariants((data ?? []) as ProductVariant[]);
    setLoading(false);
  }, [productId]);

  useEffect(() => { load(); }, [load]);

  const createVariant = useCallback(async (params: {
    variantName: string; skuSuffix?: string; priceDelta?: number; sellingPriceOverride?: number;
    costPrice?: number; barcode?: string; imageUrl?: string;
  }) => {
    if (!productId) return { error: 'No product selected' };
    const { error } = await supabase.from('product_variants').insert({
      product_id: productId, variant_name: params.variantName, sku_suffix: params.skuSuffix || null,
      price_delta: params.priceDelta ?? 0, selling_price_override: params.sellingPriceOverride ?? null,
      cost_price: params.costPrice ?? null, barcode: params.barcode || null, image_url: params.imageUrl || null,
    });
    if (error) return { error: error.message };
    await load();
    return { error: null };
  }, [productId, load]);

  const deactivateVariant = useCallback(async (variantId: string) => {
    const { error } = await supabase.from('product_variants').update({ is_active: false }).eq('id', variantId);
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  return { variants, loading, reload: load, createVariant, deactivateVariant };
}

export interface VariantStockRow {
  id: string;
  variant_id: string;
  location_type: 'warehouse' | 'van';
  location_id: string;
  quantity: number;
  location_name?: string;
}

export function useVariantStock(variantId: string | null) {
  const { company } = useAuth();
  const [stock, setStock] = useState<VariantStockRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!variantId || !company) { setStock([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase.from('variant_stock').select('*').eq('variant_id', variantId);
    const rows = (data ?? []) as VariantStockRow[];

    // Resolve location names (warehouses only supported in the UI for now).
    const warehouseIds = rows.filter((r) => r.location_type === 'warehouse').map((r) => r.location_id);
    let names = new Map<string, string>();
    if (warehouseIds.length > 0) {
      const { data: warehouses } = await supabase.from('warehouses').select('id, name').in('id', warehouseIds);
      names = new Map((warehouses ?? []).map((w) => [w.id, w.name]));
    }
    setStock(rows.map((r) => ({ ...r, location_name: names.get(r.location_id) ?? r.location_id })));
    setLoading(false);
  }, [variantId, company]);

  useEffect(() => { load(); }, [load]);

  const adjustStock = useCallback(async (locationId: string, delta: number) => {
    if (!variantId) return { error: 'No variant selected' };
    const { error } = await supabase.rpc('adjust_variant_stock', {
      p_variant_id: variantId, p_location_type: 'warehouse', p_location_id: locationId, p_delta: delta,
    });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [variantId, load]);

  return { stock, loading, reload: load, adjustStock };
}
