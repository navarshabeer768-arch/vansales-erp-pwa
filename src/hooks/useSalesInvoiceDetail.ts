import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { SalesInvoiceStatus } from './useSalesInvoices';

export interface SalesInvoiceDetail {
  id: string;
  invoice_number: string;
  is_manual_number: boolean;
  invoice_date: string;
  invoice_time: string;
  status: SalesInvoiceStatus;
  customer_reference: string | null;
  customer_po: string | null;
  notes: string | null;
  internal_notes: string | null;
  is_direct_invoice: boolean;
  direct_invoice_source: string | null;
  currency: string;
  payment_type: string;
  delivery_date: string | null;
  tax_inclusive: boolean;
  round_off_rule: string;
  gross_amount: number;
  item_discount_amount: number;
  invoice_discount_amount: number;
  promotion_discount_amount: number;
  taxable_amount: number;
  tax_amount: number;
  round_off: number;
  net_amount: number;
  total_quantity: number;
  total_free_quantity: number;
  total_base_quantity: number;
  walk_in_name: string | null;
  walk_in_phone: string | null;
  sales_order_id: string | null;
  customer: { customer_code: string; business_name: string } | null;
  invoice_type: { code: string; label: string } | null;
  route: { name: string } | null;
  beat_plan: { beat_name: string } | null;
  daily_visit_plan: { plan_date: string } | null;
  van: { code: string; name: string } | null;
  warehouse: { code: string; name: string } | null;
  salesman: { full_name: string } | null;
  payment_term: { label: string } | null;
}

export interface SalesInvoiceItemDetail {
  id: string;
  product_id: string;
  sequence: number;
  sku: string | null;
  description: string | null;
  invoice_quantity: number;
  base_quantity: number;
  free_quantity: number;
  original_price: number;
  applied_price: number;
  price_source: string | null;
  discount_pct: number;
  discount_amount: number;
  discount_source: string | null;
  tax_rate: number;
  is_tax_exempt: boolean;
  tax_amount: number;
  gross_amount: number;
  net_amount: number;
  is_free_item: boolean;
  order_item_id: string | null;
  item_notes: string | null;
  product?: { name: string } | null;
  unit?: { symbol: string } | null;
}

export function useSalesInvoiceDetail(invoiceId: string | undefined) {
  const [invoice, setInvoice] = useState<SalesInvoiceDetail | null>(null);
  const [items, setItems] = useState<SalesInvoiceItemDetail[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!invoiceId) return;
    setLoading(true);
    const [{ data: invoiceData }, { data: itemsData }] = await Promise.all([
      supabase.from('sales_invoices').select(`
        *, customer:customers(customer_code, business_name), invoice_type:sales_invoice_types(code, label),
        route:routes(name), beat_plan:beat_plans(beat_name), daily_visit_plan:daily_visit_plans(plan_date),
        van:vans(code, name), warehouse:warehouses(code, name),
        salesman:app_users!sales_invoices_salesman_id_fkey(full_name), payment_term:payment_terms(label)
      `).eq('id', invoiceId).single(),
      supabase.from('sales_invoice_items').select('*, product:products(name), unit:units(symbol)').eq('invoice_id', invoiceId).order('sequence'),
    ]);
    setInvoice(invoiceData as unknown as SalesInvoiceDetail | null);
    setItems((itemsData ?? []) as unknown as SalesInvoiceItemDetail[]);
    setLoading(false);
  }, [invoiceId]);

  useEffect(() => { load(); }, [load]);

  return { invoice, items, loading, reload: load };
}

export interface SalesInvoiceNote {
  id: string; note: string; note_type: string; created_by: string | null; created_at: string;
}

export function useSalesInvoiceNotes(invoiceId: string | undefined) {
  const { user, company } = useAuth();
  const [notes, setNotes] = useState<SalesInvoiceNote[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!invoiceId) return;
    setLoading(true);
    const { data } = await supabase.from('sales_invoice_notes').select('*').eq('invoice_id', invoiceId).order('created_at', { ascending: false });
    setNotes((data ?? []) as SalesInvoiceNote[]);
    setLoading(false);
  }, [invoiceId]);

  useEffect(() => { load(); }, [load]);

  const addNote = useCallback(async (note: string, noteType: SalesInvoiceNote['note_type'] = 'general') => {
    if (!invoiceId || !user || !company) return { error: 'Missing context' };
    const { error } = await supabase.from('sales_invoice_notes').insert({
      invoice_id: invoiceId, note, note_type: noteType, created_by: user.id, company_id: company.id,
    });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [invoiceId, user, company, load]);

  return { notes, loading, addNote };
}

export interface SalesInvoiceStatusHistoryRow {
  id: string; old_status: string | null; new_status: string; reason: string | null; changed_by: string | null; changed_at: string;
}

export function useSalesInvoiceStatusHistory(invoiceId: string | undefined) {
  const [history, setHistory] = useState<SalesInvoiceStatusHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!invoiceId) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase.from('sales_invoice_status_history').select('*').eq('invoice_id', invoiceId).order('changed_at', { ascending: false });
      setHistory((data ?? []) as SalesInvoiceStatusHistoryRow[]);
      setLoading(false);
    })();
  }, [invoiceId]);

  return { history, loading };
}
