import { useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { decodeEntityQr } from '@/lib/qrScheme';

export type ScanLookupType = 'product' | 'batch' | 'serial' | 'customer' | 'invoice' | 'van' | 'warehouse' | 'unknown';

export interface ScanLookupResult {
  type: ScanLookupType;
  id: string | null;
  label: string | null;
  raw: string;
}

async function lookupRawValue(companyId: string, raw: string): Promise<{ type: ScanLookupType; id: string | null; label: string | null }> {
  // Product barcode or SKU — the overwhelmingly common case for scans that aren't our own QR codes.
  const { data: product } = await supabase
    .from('products').select('id, name').eq('company_id', companyId)
    .or(`barcode.eq.${raw},sku.eq.${raw}`).maybeSingle();
  if (product) return { type: 'product', id: product.id, label: product.name };

  const { data: batch } = await supabase
    .from('batches').select('id, batch_no, product:products(name)').eq('company_id', companyId).eq('batch_no', raw).maybeSingle();
  if (batch) return { type: 'batch', id: batch.id, label: `${(batch as any).product?.name ?? 'Batch'} — ${batch.batch_no}` };

  const { data: serial } = await supabase
    .from('product_serials').select('id, serial_no, product:products(name)').eq('company_id', companyId).eq('serial_no', raw).maybeSingle();
  if (serial) return { type: 'serial', id: serial.id, label: `${(serial as any).product?.name ?? 'Serial'} — ${serial.serial_no}` };

  return { type: 'unknown', id: null, label: null };
}

async function lookupEntity(companyId: string, type: 'customer' | 'invoice' | 'van' | 'warehouse', id: string): Promise<{ label: string | null }> {
  if (type === 'customer') {
    const { data } = await supabase.from('customers').select('business_name').eq('company_id', companyId).eq('id', id).maybeSingle();
    return { label: data?.business_name ?? null };
  }
  if (type === 'invoice') {
    const { data } = await supabase.from('sales').select('invoice_no').eq('company_id', companyId).eq('id', id).maybeSingle();
    return { label: data?.invoice_no ?? null };
  }
  if (type === 'van') {
    const { data } = await supabase.from('vans').select('name').eq('company_id', companyId).eq('id', id).maybeSingle();
    return { label: data?.name ?? null };
  }
  const { data } = await supabase.from('warehouses').select('name').eq('company_id', companyId).eq('id', id).maybeSingle();
  return { label: data?.name ?? null };
}

export function useScanLookup() {
  const { company, user } = useAuth();

  const lookup = useCallback(async (
    scanType: 'barcode' | 'qr', raw: string, context: string
  ): Promise<ScanLookupResult> => {
    if (!company) return { type: 'unknown', id: null, label: null, raw };

    const decoded = decodeEntityQr(raw);
    let result: { type: ScanLookupType; id: string | null; label: string | null };
    if (decoded) {
      const entity = await lookupEntity(company.id, decoded.type, decoded.id);
      result = { type: decoded.type, id: decoded.id, label: entity.label };
    } else {
      result = await lookupRawValue(company.id, raw);
    }

    await supabase.from('scan_logs').insert({
      company_id: company.id, device_id: null, employee_id: user?.id ?? null,
      scan_type: scanType, scanned_value: raw, lookup_type: result.type,
      lookup_result_id: result.id, lookup_success: result.type !== 'unknown', context,
    });

    return { ...result, raw };
  }, [company, user]);

  return { lookup };
}
