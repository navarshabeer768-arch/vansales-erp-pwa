import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface CustomerInvoiceForReturn {
  id: string;
  invoice_number: string;
  final_invoice_number: string | null;
  invoice_date: string;
  net_amount: number;
  payment_status: string;
}

export function useCustomerInvoicesForReturn(customerId: string | undefined) {
  const [invoices, setInvoices] = useState<CustomerInvoiceForReturn[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!customerId) { setInvoices([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from('sales_invoices')
      .select('id, invoice_number, final_invoice_number, invoice_date, net_amount, payment_status')
      .eq('customer_id', customerId)
      .eq('posting_status', 'posted')
      .not('status', 'in', '(void_requested,voided)')
      .order('invoice_date', { ascending: false })
      .limit(50);
    setInvoices((data ?? []) as CustomerInvoiceForReturn[]);
    setLoading(false);
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  return { invoices, loading, reload: load };
}

export interface ReturnableInvoiceItem {
  invoice_item_id: string; product_id: string; product_name: string; sku: string; uom_label: string;
  invoice_quantity: number; base_quantity: number; previously_returned_quantity: number;
  remaining_returnable_quantity: number; is_free_item: boolean; unit_price: number;
  discount_amount: number; tax_amount: number; tax_rate: number; tax_inclusive: boolean;
  batch_required: boolean; serial_required: boolean;
}

export function useInvoiceReturnableItems(invoiceId: string | undefined) {
  const [items, setItems] = useState<ReturnableInvoiceItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!invoiceId) { setItems([]); return; }
    setLoading(true);
    const { data } = await supabase.rpc('invoice_returnable_items', { p_invoice_id: invoiceId });
    setItems((data ?? []) as ReturnableInvoiceItem[]);
    setLoading(false);
  }, [invoiceId]);

  useEffect(() => { load(); }, [load]);

  return { items, loading, reload: load };
}

export interface ReversalPreview {
  unit_price: number; gross_amount: number; discount_reversal: number; promotion_reversal: number;
  tax_reversal: number; net_amount: number;
}

export function useReversalPreview() {
  const [calculating, setCalculating] = useState(false);

  const calculate = useCallback(async (invoiceItemId: string, returnBaseQuantity: number) => {
    setCalculating(true);
    const { data, error } = await supabase.rpc('calculate_return_reversal_preview', {
      p_invoice_item_id: invoiceItemId, p_return_base_quantity: returnBaseQuantity,
    });
    setCalculating(false);
    if (error) return { error: error.message };
    return { data: (data?.[0] as ReversalPreview) ?? null };
  }, []);

  return { calculate, calculating };
}
