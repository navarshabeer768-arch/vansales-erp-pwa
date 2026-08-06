import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { AdjustmentStatus, CreditNoteItemInput } from './useCreditNotes';

export interface DebitNoteRow {
  id: string; document_number: string; document_date: string; status: AdjustmentStatus;
  net_amount: number; adjustment_type: string;
  customer: { customer_code: string; business_name: string } | null;
  document_type: { code: string; label: string } | null;
}

function genClientUuid(prefix: string) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`; }

export function useCreateDebitNote() {
  const [submitting, setSubmitting] = useState(false);

  const submit = useCallback(async (params: {
    documentTypeCode: string; customerId: string; items?: CreditNoteItemInput[]; amountOnlyValue?: number;
    originalInvoiceId?: string | null; reasonCode?: string | null; adjustmentType?: string;
    referenceNumber?: string; internalNotes?: string; customerNotes?: string; documentSource?: string;
    routeId?: string | null; vanId?: string | null; deviceUid?: string | null; isOffline?: boolean;
  }) => {
    setSubmitting(true);
    const { data, error } = await supabase.rpc('create_debit_note_draft_notified', {
      p_document_type_code: params.documentTypeCode, p_customer_id: params.customerId, p_client_uuid: genClientUuid('dn'),
      p_items: params.items ?? [], p_amount_only_value: params.amountOnlyValue ?? null,
      p_original_invoice_id: params.originalInvoiceId ?? null, p_reason_code: params.reasonCode ?? null,
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

export function useDebitNotes(filters: { dateFrom?: string; dateTo?: string; status?: AdjustmentStatus } = {}) {
  const { company } = useAuth();
  const [notes, setNotes] = useState<DebitNoteRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    let query = supabase
      .from('debit_notes')
      .select('id, document_number, document_date, status, net_amount, adjustment_type, customer:customers(customer_code, business_name), document_type:financial_document_types(code, label)')
      .eq('company_id', company.id)
      .order('document_date', { ascending: false });
    if (filters.dateFrom) query = query.gte('document_date', filters.dateFrom);
    if (filters.dateTo) query = query.lte('document_date', filters.dateTo);
    if (filters.status) query = query.eq('status', filters.status);
    const { data } = await query;
    setNotes((data ?? []) as unknown as DebitNoteRow[]);
    setLoading(false);
  }, [company, filters.dateFrom, filters.dateTo, filters.status]);

  useEffect(() => { load(); }, [load]);

  const submitDraft = useCallback(async (id: string) => {
    const { error } = await supabase.rpc('change_debit_note_status', { p_id: id, p_new_status: 'submitted' });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  const cancelDraft = useCallback(async (id: string, reason: string) => {
    const { error } = await supabase.rpc('cancel_debit_note_draft', { p_id: id, p_reason: reason });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  return { notes, loading, reload: load, submitDraft, cancelDraft };
}

export interface DebitNoteDetail {
  id: string; document_number: string; document_date: string; status: AdjustmentStatus; adjustment_type: string;
  gross_amount: number; net_amount: number;
  reference_number: string | null; internal_notes: string | null; customer_notes: string | null;
  customer_id: string; original_invoice_id: string | null; currency: string;
  customer: { customer_code: string; business_name: string } | null;
  document_type: { code: string; label: string } | null;
  reason: { code: string; label: string } | null;
  original_invoice: { invoice_number: string; final_invoice_number: string | null } | null;
}

export interface DebitNoteItemDetail {
  id: string; description: string | null; quantity: number | null; unit_price: number | null;
  original_price: number | null; corrected_price: number | null;
  original_quantity: number | null; corrected_quantity: number | null;
  original_discount: number | null; corrected_discount: number | null;
  original_tax: number | null; corrected_tax: number | null;
  adjustment_amount: number; item_notes: string | null;
  product: { name: string; sku: string } | null;
}

export function useDebitNoteDetail(id: string | undefined) {
  const [doc, setDoc] = useState<DebitNoteDetail | null>(null);
  const [items, setItems] = useState<DebitNoteItemDetail[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: docData }, { data: itemsData }] = await Promise.all([
      supabase.from('debit_notes').select(`
        *, customer:customers(customer_code, business_name), document_type:financial_document_types(code, label),
        reason:financial_adjustment_reasons(code, label), original_invoice:sales_invoices(invoice_number, final_invoice_number)
      `).eq('id', id).single(),
      supabase.from('debit_note_items').select('*, product:products(name, sku)').eq('debit_note_id', id).order('sequence'),
    ]);
    setDoc(docData as unknown as DebitNoteDetail | null);
    setItems((itemsData ?? []) as unknown as DebitNoteItemDetail[]);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const updateDraft = useCallback(async (params: { customerId?: string; originalInvoiceId?: string; reasonCode?: string; referenceNumber?: string; internalNotes?: string; customerNotes?: string; amountOnlyValue?: number }) => {
    if (!id) return { error: 'No document' };
    const { error } = await supabase.rpc('update_debit_note_draft', {
      p_id: id, p_customer_id: params.customerId ?? null, p_original_invoice_id: params.originalInvoiceId ?? null,
      p_reason_code: params.reasonCode ?? null, p_reference_number: params.referenceNumber ?? null,
      p_internal_notes: params.internalNotes ?? null, p_customer_notes: params.customerNotes ?? null,
      p_amount_only_value: params.amountOnlyValue ?? null,
    });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [id, load]);

  return { doc, items, loading, reload: load, updateDraft };
}
