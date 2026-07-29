import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface ProductSerial {
  id: string;
  product_id: string;
  serial_no: string;
  status: 'in_stock' | 'sold' | 'damaged' | 'lost' | 'returned';
  current_location_type: 'warehouse' | 'van' | null;
  current_location_id: string | null;
  warranty_months: number | null;
  warranty_expiry: string | null;
  sold_at: string | null;
  notes: string | null;
  created_at: string;
  product?: { id: string; name: string; sku: string } | null;
  customer?: { id: string; business_name: string } | null;
  sale?: { id: string; invoice_no: string } | null;
}

export function useSerials(productId: string | null) {
  const { company } = useAuth();
  const [serials, setSerials] = useState<ProductSerial[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    let query = supabase
      .from('product_serials')
      .select('*, product:products(id,name,sku), customer:customers(id,business_name), sale:sales(id,invoice_no)')
      .eq('company_id', company.id);
    if (productId) query = query.eq('product_id', productId);
    const { data } = await query.order('created_at', { ascending: false }).limit(500);
    setSerials((data ?? []) as unknown as ProductSerial[]);
    setLoading(false);
  }, [company, productId]);

  useEffect(() => { load(); }, [load]);

  const createSerial = useCallback(async (params: {
    productId: string; serialNo: string; warrantyMonths?: number;
    locationType?: 'warehouse' | 'van'; locationId?: string; notes?: string;
  }) => {
    if (!company) return { error: 'No company context' };
    const { error } = await supabase.from('product_serials').insert({
      company_id: company.id, product_id: params.productId, serial_no: params.serialNo,
      status: 'in_stock', warranty_months: params.warrantyMonths ?? null,
      current_location_type: params.locationType ?? null, current_location_id: params.locationId ?? null,
      notes: params.notes || null,
    });
    if (error) return { error: error.code === '23505' ? 'This serial number already exists for this product.' : error.message };
    await load();
    return { error: null };
  }, [company, load]);

  const markStatus = useCallback(async (serialId: string, status: ProductSerial['status']) => {
    const { error } = await supabase.from('product_serials').update({ status }).eq('id', serialId);
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  return { serials, loading, reload: load, createSerial, markStatus };
}

export async function searchSerial(companyId: string, serialNo: string): Promise<ProductSerial | null> {
  const { data } = await supabase
    .from('product_serials')
    .select('*, product:products(id,name,sku), customer:customers(id,business_name), sale:sales(id,invoice_no)')
    .eq('company_id', companyId)
    .ilike('serial_no', serialNo)
    .maybeSingle();
  return (data ?? null) as unknown as ProductSerial | null;
}
