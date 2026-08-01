import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface PriceRequest {
  id: string; invoice_item_id: string; original_price: number; current_price: number; requested_price: number;
  reason: string | null; status: string; request_time: string;
}
export interface DiscountRequest {
  id: string; invoice_item_id: string | null; requested_discount_pct: number | null; allowed_discount_pct: number | null;
  difference_pct: number | null; reason: string | null; status: string; request_time: string;
}
export interface FreeQuantityRequest {
  id: string; invoice_item_id: string | null; product_id: string; requested_free_quantity: number;
  scheme_free_quantity: number; additional_free_quantity: number; reason: string | null; status: string; request_time: string;
}

export function useInvoiceRequests(invoiceId: string | undefined) {
  const [priceRequests, setPriceRequests] = useState<PriceRequest[]>([]);
  const [discountRequests, setDiscountRequests] = useState<DiscountRequest[]>([]);
  const [freeQuantityRequests, setFreeQuantityRequests] = useState<FreeQuantityRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!invoiceId) return;
    setLoading(true);
    const [{ data: pr }, { data: dr }, { data: fr }] = await Promise.all([
      supabase.from('sales_invoice_price_requests').select('*').eq('invoice_id', invoiceId).order('request_time', { ascending: false }),
      supabase.from('sales_invoice_discount_requests').select('*').eq('invoice_id', invoiceId).order('request_time', { ascending: false }),
      supabase.from('sales_invoice_free_quantity_requests').select('*').eq('invoice_id', invoiceId).order('request_time', { ascending: false }),
    ]);
    setPriceRequests((pr ?? []) as PriceRequest[]);
    setDiscountRequests((dr ?? []) as DiscountRequest[]);
    setFreeQuantityRequests((fr ?? []) as FreeQuantityRequest[]);
    setLoading(false);
  }, [invoiceId]);

  useEffect(() => { load(); }, [load]);

  const requestPriceOverride = useCallback(async (invoiceItemId: string, requestedPrice: number, reason: string) => {
    const { error } = await supabase.rpc('request_invoice_price_override_notified', {
      p_invoice_item_id: invoiceItemId, p_requested_price: requestedPrice, p_reason: reason,
    });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  const requestDiscountOverride = useCallback(async (invoiceItemId: string, requestedPct: number, allowedPct: number, reason: string) => {
    const { error } = await supabase.rpc('request_invoice_discount_override_notified', {
      p_invoice_item_id: invoiceItemId, p_requested_discount_pct: requestedPct, p_allowed_discount_pct: allowedPct, p_reason: reason,
    });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  const requestManualFreeQuantity = useCallback(async (
    invoiceItemId: string, productId: string, requestedQty: number, schemeQty: number, reason: string
  ) => {
    const { error } = await supabase.rpc('request_invoice_manual_free_quantity_notified', {
      p_invoice_item_id: invoiceItemId, p_product_id: productId, p_requested_free_quantity: requestedQty,
      p_scheme_free_quantity: schemeQty, p_reason: reason,
    });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  return {
    priceRequests, discountRequests, freeQuantityRequests, loading, reload: load,
    requestPriceOverride, requestDiscountOverride, requestManualFreeQuantity,
  };
}
