import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface OrderConversionSummaryRow {
  order_item_id: string;
  product_name: string;
  ordered_quantity: number;
  previously_converted_quantity: number;
  cancelled_quantity: number;
  remaining_quantity: number;
  backorder_quantity: number;
  is_free_item: boolean;
}

export function useOrderConversionSummary(orderId: string | undefined) {
  const [rows, setRows] = useState<OrderConversionSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    const { data } = await supabase.rpc('sales_order_conversion_summary', { p_order_id: orderId });
    setRows((data ?? []) as OrderConversionSummaryRow[]);
    setLoading(false);
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  return { rows, loading, reload: load };
}

function genClientUuid() {
  return `conv-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function useConvertOrderToInvoice() {
  const [submitting, setSubmitting] = useState(false);

  const convert = useCallback(async (
    orderId: string, selections: { order_item_id: string; quantity: number }[], deliveryDate?: string, notes?: string
  ) => {
    setSubmitting(true);
    const { data, error } = await supabase.rpc('convert_sales_order_to_invoice', {
      p_order_id: orderId, p_item_selections: selections, p_client_uuid: genClientUuid(),
      p_delivery_date: deliveryDate ?? null, p_notes: notes ?? null,
    });
    setSubmitting(false);
    if (error) return { error: error.message };
    return { data: data as string };
  }, []);

  return { convert, submitting };
}
