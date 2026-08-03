import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { SalesReturnStatus } from './useSalesReturns';

export interface SalesReturnDetail {
  id: string;
  return_number: string;
  return_date: string;
  return_time: string;
  status: SalesReturnStatus;
  validation_status: string;
  gross_return_amount: number;
  discount_reversal_amount: number;
  promotion_reversal_amount: number;
  tax_reversal_amount: number;
  net_return_amount: number;
  total_return_quantity: number;
  total_base_quantity: number;
  replacement_requested: boolean;
  credit_note_requested: boolean;
  cash_refund_requested: boolean;
  customer_reference: string | null;
  customer_complaint_reference: string | null;
  currency: string;
  return_source: string;
  is_on_hold: boolean;
  customer_id: string;
  original_invoice_id: string | null;
  notes: string | null;
  internal_notes: string | null;
  customer: { customer_code: string; business_name: string } | null;
  return_type: { code: string; label: string } | null;
  return_reason: { code: string; label: string } | null;
  route: { name: string } | null;
  van: { code: string; name: string } | null;
  original_invoice: { invoice_number: string; final_invoice_number: string | null } | null;
}

export interface SalesReturnItemDetail {
  id: string;
  product_id: string;
  description: string | null;
  return_quantity: number;
  base_return_quantity: number;
  is_free_item: boolean;
  unit_price: number;
  discount_reversal: number;
  promotion_reversal: number;
  tax_reversal: number;
  gross_return_amount: number;
  net_return_amount: number;
  batch_required: boolean;
  serial_required: boolean;
  replacement_requested: boolean;
  item_notes: string | null;
  product: { name: string; sku: string } | null;
  return_condition: { label: string } | null;
  return_reason: { label: string } | null;
  batches?: { batch_id: string; return_quantity: number; batch?: { batch_no: string } | null }[];
  serials?: { serial_id: string; return_status: string; serial?: { serial_no: string } | null }[];
}

export function useSalesReturnDetail(returnId: string | undefined) {
  const [salesReturn, setSalesReturn] = useState<SalesReturnDetail | null>(null);
  const [items, setItems] = useState<SalesReturnItemDetail[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!returnId) return;
    setLoading(true);
    const [{ data: returnData }, { data: itemsData }] = await Promise.all([
      supabase.from('sales_returns').select(`
        *, customer:customers(customer_code, business_name), return_type:sales_return_types(code, label),
        return_reason:sales_return_reasons(code, label), route:routes(name), van:vans(code, name),
        original_invoice:sales_invoices(invoice_number, final_invoice_number)
      `).eq('id', returnId).single(),
      supabase.from('sales_return_items').select(`
        *, product:products(name, sku), return_condition:sales_return_conditions(label), return_reason:sales_return_reasons(label),
        batches:sales_return_item_batches(batch_id, return_quantity, batch:batches(batch_no)),
        serials:sales_return_item_serials(serial_id, return_status, serial:product_serials(serial_no))
      `).eq('return_id', returnId).eq('item_status', 'active').order('sequence'),
    ]);
    setSalesReturn(returnData as unknown as SalesReturnDetail | null);
    setItems((itemsData ?? []) as unknown as SalesReturnItemDetail[]);
    setLoading(false);
  }, [returnId]);

  useEffect(() => { load(); }, [load]);

  return { salesReturn, items, loading, reload: load };
}

export interface SalesReturnNote {
  id: string; note: string; note_type: string; created_by: string | null; created_at: string;
}

export function useSalesReturnNotes(returnId: string | undefined) {
  const { user, company } = useAuth();
  const [notes, setNotes] = useState<SalesReturnNote[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!returnId) return;
    setLoading(true);
    const { data } = await supabase.from('sales_return_notes').select('*').eq('return_id', returnId).order('created_at', { ascending: false });
    setNotes((data ?? []) as SalesReturnNote[]);
    setLoading(false);
  }, [returnId]);

  useEffect(() => { load(); }, [load]);

  const addNote = useCallback(async (note: string, noteType: SalesReturnNote['note_type'] = 'general') => {
    if (!returnId || !user || !company) return { error: 'Missing context' };
    const { error } = await supabase.from('sales_return_notes').insert({
      return_id: returnId, note, note_type: noteType, created_by: user.id, company_id: company.id,
    });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [returnId, user, company, load]);

  return { notes, loading, addNote };
}

export interface SalesReturnStatusHistoryRow {
  id: string; old_status: string | null; new_status: string; reason: string | null; changed_by: string | null; changed_at: string;
}

export function useSalesReturnStatusHistory(returnId: string | undefined) {
  const [history, setHistory] = useState<SalesReturnStatusHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!returnId) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase.from('sales_return_status_history').select('*').eq('return_id', returnId).order('changed_at', { ascending: false });
      setHistory((data ?? []) as SalesReturnStatusHistoryRow[]);
      setLoading(false);
    })();
  }, [returnId]);

  return { history, loading };
}
