import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { AdjustmentStatus } from './useCreditNotes';

export interface InvoiceItemForAdjustment {
  invoice_item_id: string; product_id: string; product_name: string; sku: string; uom_label: string;
  invoice_quantity: number; base_quantity: number; unit_price: number; discount_amount: number;
  tax_amount: number; tax_rate: number; tax_inclusive: boolean; is_free_item: boolean;
}

export function useInvoiceItemsForAdjustment(invoiceId: string | undefined) {
  const [items, setItems] = useState<InvoiceItemForAdjustment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!invoiceId) { setItems([]); return; }
    (async () => {
      setLoading(true);
      const { data } = await supabase.rpc('invoice_items_for_adjustment', { p_invoice_id: invoiceId });
      setItems((data ?? []) as InvoiceItemForAdjustment[]);
      setLoading(false);
    })();
  }, [invoiceId]);

  return { items, loading };
}

export interface CustomerAdjustmentItemInput {
  invoice_item_id: string; description?: string; quantity?: number;
  corrected_price?: number; corrected_quantity?: number; corrected_discount?: number; corrected_tax?: number;
  adjustment_amount?: number; promotion_notes?: string; reason_code?: string; item_notes?: string;
}

function genClientUuid() { return `adj-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`; }

export function useCreateCustomerAdjustment() {
  const [submitting, setSubmitting] = useState(false);

  const submit = useCallback(async (params: {
    documentTypeCode: string; customerId: string; originalInvoiceId: string; items: CustomerAdjustmentItemInput[];
    reasonCode?: string | null; adjustmentType?: string; referenceNumber?: string; internalNotes?: string; customerNotes?: string;
    documentSource?: string; routeId?: string | null; vanId?: string | null; deviceUid?: string | null; isOffline?: boolean;
  }) => {
    setSubmitting(true);
    const { data, error } = await supabase.rpc('create_customer_adjustment_draft_notified', {
      p_document_type_code: params.documentTypeCode, p_customer_id: params.customerId, p_original_invoice_id: params.originalInvoiceId,
      p_client_uuid: genClientUuid(), p_items: params.items, p_reason_code: params.reasonCode ?? null,
      p_adjustment_type: params.adjustmentType ?? null, p_reference_number: params.referenceNumber ?? null,
      p_internal_notes: params.internalNotes ?? null, p_customer_notes: params.customerNotes ?? null,
      p_document_source: params.documentSource ?? 'web', p_route_id: params.routeId ?? null, p_van_id: params.vanId ?? null,
      p_device_uid: params.deviceUid ?? null, p_is_offline: params.isOffline ?? false,
    });
    setSubmitting(false);
    if (error) return { error: error.message };
    return { data: data as string };
  }, []);

  return { submit, submitting };
}

export interface CustomerAdjustmentRow {
  id: string; document_number: string; document_date: string; status: AdjustmentStatus;
  net_amount: number; net_direction: 'credit' | 'debit'; adjustment_type: string;
  customer: { customer_code: string; business_name: string } | null;
  document_type: { code: string; label: string } | null;
}

export function useCustomerAdjustments(filters: { dateFrom?: string; dateTo?: string; status?: AdjustmentStatus } = {}) {
  const { company } = useAuth();
  const [adjustments, setAdjustments] = useState<CustomerAdjustmentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    let query = supabase
      .from('customer_adjustments')
      .select('id, document_number, document_date, status, net_amount, net_direction, adjustment_type, customer:customers(customer_code, business_name), document_type:financial_document_types(code, label)')
      .eq('company_id', company.id)
      .order('document_date', { ascending: false });
    if (filters.dateFrom) query = query.gte('document_date', filters.dateFrom);
    if (filters.dateTo) query = query.lte('document_date', filters.dateTo);
    if (filters.status) query = query.eq('status', filters.status);
    const { data } = await query;
    setAdjustments((data ?? []) as unknown as CustomerAdjustmentRow[]);
    setLoading(false);
  }, [company, filters.dateFrom, filters.dateTo, filters.status]);

  useEffect(() => { load(); }, [load]);

  const submitDraft = useCallback(async (id: string) => {
    const { error } = await supabase.rpc('change_customer_adjustment_status', { p_id: id, p_new_status: 'submitted' });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  const cancelDraft = useCallback(async (id: string, reason: string) => {
    const { error } = await supabase.rpc('cancel_customer_adjustment_draft', { p_id: id, p_reason: reason });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  return { adjustments, loading, reload: load, submitDraft, cancelDraft };
}

export interface CustomerAdjustmentDetail {
  id: string; document_number: string; document_date: string; status: AdjustmentStatus; adjustment_type: string;
  net_amount: number; net_direction: 'credit' | 'debit';
  reference_number: string | null; internal_notes: string | null; customer_notes: string | null;
  customer_id: string; original_invoice_id: string; currency: string;
  customer: { customer_code: string; business_name: string } | null;
  document_type: { code: string; label: string } | null;
  reason: { code: string; label: string } | null;
  original_invoice: { invoice_number: string; final_invoice_number: string | null } | null;
}

export interface CustomerAdjustmentItemDetail {
  id: string; description: string | null; quantity: number | null; unit_price: number | null;
  original_price: number | null; corrected_price: number | null; price_difference: number | null;
  original_quantity: number | null; corrected_quantity: number | null; quantity_difference: number | null;
  original_discount: number | null; corrected_discount: number | null; discount_difference: number | null;
  original_tax: number | null; corrected_tax: number | null; tax_difference: number | null;
  promotion_notes: string | null; adjustment_amount: number; item_notes: string | null;
  product: { name: string; sku: string } | null;
}

export function useCustomerAdjustmentDetail(id: string | undefined) {
  const [doc, setDoc] = useState<CustomerAdjustmentDetail | null>(null);
  const [items, setItems] = useState<CustomerAdjustmentItemDetail[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: docData }, { data: itemsData }] = await Promise.all([
      supabase.from('customer_adjustments').select(`
        *, customer:customers(customer_code, business_name), document_type:financial_document_types(code, label),
        reason:financial_adjustment_reasons(code, label), original_invoice:sales_invoices(invoice_number, final_invoice_number)
      `).eq('id', id).single(),
      supabase.from('customer_adjustment_items').select('*, product:products(name, sku)').eq('adjustment_id', id).order('sequence'),
    ]);
    setDoc(docData as unknown as CustomerAdjustmentDetail | null);
    setItems((itemsData ?? []) as unknown as CustomerAdjustmentItemDetail[]);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const updateDraft = useCallback(async (params: { reasonCode?: string; referenceNumber?: string; internalNotes?: string; customerNotes?: string }) => {
    if (!id) return { error: 'No document' };
    const { error } = await supabase.rpc('update_customer_adjustment_draft', {
      p_id: id, p_reason_code: params.reasonCode ?? null, p_reference_number: params.referenceNumber ?? null,
      p_internal_notes: params.internalNotes ?? null, p_customer_notes: params.customerNotes ?? null,
    });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [id, load]);

  return { doc, items, loading, reload: load, updateDraft };
}
