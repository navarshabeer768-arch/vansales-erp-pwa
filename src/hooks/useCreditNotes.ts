import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export const ADJUSTMENT_STATUS_STYLES: Record<AdjustmentStatus, string> = {
  draft: 'bg-slate-100 text-slate-600 dark:bg-slate-800',
  pending_validation: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30',
  pending_approval: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30',
  approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30',
  returned_for_correction: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30',
  on_hold: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30',
  ready_to_post: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30',
  posting: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30',
  posted: 'bg-emerald-200 text-emerald-800 dark:bg-emerald-900/50',
  posting_failed: 'bg-red-100 text-red-700 dark:bg-red-900/30',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30',
  reversal_requested: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30',
  reversed: 'bg-slate-200 text-slate-500 dark:bg-slate-700',
  sync_pending: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30',
  sync_failed: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30',
  conflict: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30',
  pending_submission: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30',
  submitted: 'bg-green-100 text-green-700 dark:bg-green-900/30',
  returned: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30',
  expired: 'bg-slate-200 text-slate-500 dark:bg-slate-700',
};

export type AdjustmentStatus =
  | 'draft' | 'pending_validation' | 'pending_approval' | 'approved' | 'returned_for_correction' | 'on_hold'
  | 'ready_to_post' | 'posting' | 'posted' | 'posting_failed' | 'cancelled' | 'reversal_requested' | 'reversed'
  | 'sync_pending' | 'sync_failed' | 'conflict' | 'pending_submission' | 'submitted' | 'returned' | 'expired';

export interface CreditNoteRow {
  id: string; document_number: string; document_date: string; status: AdjustmentStatus;
  net_amount: number; adjustment_type: string;
  customer: { customer_code: string; business_name: string } | null;
  document_type: { code: string; label: string } | null;
}

export interface CreditNoteItemInput {
  invoice_item_id?: string | null; product_id?: string | null; variant_id?: string | null; description?: string;
  uom_id?: string | null; quantity?: number; unit_price?: number;
  original_price?: number; corrected_price?: number;
  original_quantity?: number; corrected_quantity?: number;
  original_discount?: number; corrected_discount?: number;
  original_tax?: number; corrected_tax?: number;
  adjustment_amount?: number; reason_code?: string; item_notes?: string;
}

function genClientUuid(prefix: string) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`; }

export function useCreateCreditNote() {
  const [submitting, setSubmitting] = useState(false);

  const submit = useCallback(async (params: {
    documentTypeCode: string; customerId: string; items?: CreditNoteItemInput[]; amountOnlyValue?: number;
    originalInvoiceId?: string | null; originalReturnId?: string | null; reasonCode?: string | null; adjustmentType?: string;
    referenceNumber?: string; internalNotes?: string; customerNotes?: string; documentSource?: string;
    routeId?: string | null; vanId?: string | null; deviceUid?: string | null; isOffline?: boolean;
  }) => {
    setSubmitting(true);
    const { data, error } = await supabase.rpc('create_credit_note_draft_notified', {
      p_document_type_code: params.documentTypeCode, p_customer_id: params.customerId, p_client_uuid: genClientUuid('cn'),
      p_items: params.items ?? [], p_amount_only_value: params.amountOnlyValue ?? null,
      p_original_invoice_id: params.originalInvoiceId ?? null, p_original_return_id: params.originalReturnId ?? null,
      p_reason_code: params.reasonCode ?? null, p_adjustment_type: params.adjustmentType ?? null,
      p_reference_number: params.referenceNumber ?? null, p_internal_notes: params.internalNotes ?? null,
      p_customer_notes: params.customerNotes ?? null, p_document_source: params.documentSource ?? 'web',
      p_route_id: params.routeId ?? null, p_van_id: params.vanId ?? null, p_device_uid: params.deviceUid ?? null,
      p_is_offline: params.isOffline ?? false,
    });
    setSubmitting(false);
    if (error) return { error: error.message };
    return { data: data as string };
  }, []);

  return { submit, submitting };
}

export function useCreditNotes(filters: { dateFrom?: string; dateTo?: string; status?: AdjustmentStatus } = {}) {
  const { company } = useAuth();
  const [notes, setNotes] = useState<CreditNoteRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    let query = supabase
      .from('credit_notes')
      .select('id, document_number, document_date, status, net_amount, adjustment_type, customer:customers(customer_code, business_name), document_type:financial_document_types(code, label)')
      .eq('company_id', company.id)
      .order('document_date', { ascending: false });
    if (filters.dateFrom) query = query.gte('document_date', filters.dateFrom);
    if (filters.dateTo) query = query.lte('document_date', filters.dateTo);
    if (filters.status) query = query.eq('status', filters.status);
    const { data } = await query;
    setNotes((data ?? []) as unknown as CreditNoteRow[]);
    setLoading(false);
  }, [company, filters.dateFrom, filters.dateTo, filters.status]);

  useEffect(() => { load(); }, [load]);

  const submitDraft = useCallback(async (id: string) => {
    const { error } = await supabase.rpc('change_credit_note_status', { p_id: id, p_new_status: 'submitted' });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  const cancelDraft = useCallback(async (id: string, reason: string) => {
    const { error } = await supabase.rpc('cancel_credit_note_draft', { p_id: id, p_reason: reason });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  return { notes, loading, reload: load, submitDraft, cancelDraft };
}

export interface CreditNoteDetail {
  id: string; document_number: string; document_date: string; status: AdjustmentStatus; adjustment_type: string;
  gross_amount: number; discount_amount: number; tax_amount: number; net_amount: number;
  reference_number: string | null; internal_notes: string | null; customer_notes: string | null;
  customer_id: string; original_invoice_id: string | null; original_return_id: string | null; currency: string;
  customer: { customer_code: string; business_name: string } | null;
  document_type: { code: string; label: string } | null;
  reason: { code: string; label: string } | null;
  original_invoice: { invoice_number: string; final_invoice_number: string | null } | null;
}

export interface CreditNoteItemDetail {
  id: string; description: string | null; quantity: number | null; unit_price: number | null;
  original_price: number | null; corrected_price: number | null; price_difference: number | null;
  original_quantity: number | null; corrected_quantity: number | null; quantity_difference: number | null;
  original_discount: number | null; corrected_discount: number | null; discount_difference: number | null;
  original_tax: number | null; corrected_tax: number | null; tax_difference: number | null;
  adjustment_amount: number; item_notes: string | null;
  product: { name: string; sku: string } | null;
}

export function useCreditNoteDetail(id: string | undefined) {
  const [doc, setDoc] = useState<CreditNoteDetail | null>(null);
  const [items, setItems] = useState<CreditNoteItemDetail[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: docData }, { data: itemsData }] = await Promise.all([
      supabase.from('credit_notes').select(`
        *, customer:customers(customer_code, business_name), document_type:financial_document_types(code, label),
        reason:financial_adjustment_reasons(code, label), original_invoice:sales_invoices(invoice_number, final_invoice_number)
      `).eq('id', id).single(),
      supabase.from('credit_note_items').select('*, product:products(name, sku)').eq('credit_note_id', id).order('sequence'),
    ]);
    setDoc(docData as unknown as CreditNoteDetail | null);
    setItems((itemsData ?? []) as unknown as CreditNoteItemDetail[]);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const updateDraft = useCallback(async (params: { customerId?: string; originalInvoiceId?: string; reasonCode?: string; referenceNumber?: string; internalNotes?: string; customerNotes?: string; amountOnlyValue?: number }) => {
    if (!id) return { error: 'No document' };
    const { error } = await supabase.rpc('update_credit_note_draft', {
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

export interface AdjustmentNote { id: string; note: string; note_type: string; created_at: string; }

export function useAdjustmentNotes(documentTable: 'credit_notes' | 'debit_notes' | 'customer_adjustments', documentId: string | undefined) {
  const { user, company } = useAuth();
  const [notes, setNotes] = useState<AdjustmentNote[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!documentId) return;
    setLoading(true);
    const { data } = await supabase.from('adjustment_notes').select('*').eq('document_table', documentTable).eq('document_id', documentId).order('created_at', { ascending: false });
    setNotes((data ?? []) as AdjustmentNote[]);
    setLoading(false);
  }, [documentTable, documentId]);

  useEffect(() => { load(); }, [load]);

  const addNote = useCallback(async (note: string, noteType: string = 'general') => {
    if (!documentId || !user || !company) return { error: 'Missing context' };
    const { error } = await supabase.from('adjustment_notes').insert({
      document_table: documentTable, document_id: documentId, note, note_type: noteType, created_by: user.id, company_id: company.id,
    });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [documentTable, documentId, user, company, load]);

  return { notes, loading, addNote };
}

export interface AdjustmentStatusHistoryRow { id: string; old_status: string | null; new_status: string; reason: string | null; changed_at: string; }

export function useAdjustmentStatusHistory(documentTable: 'credit_notes' | 'debit_notes' | 'customer_adjustments', documentId: string | undefined) {
  const [history, setHistory] = useState<AdjustmentStatusHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!documentId) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase.from('adjustment_status_history').select('*').eq('document_table', documentTable).eq('document_id', documentId).order('changed_at', { ascending: false });
      setHistory((data ?? []) as AdjustmentStatusHistoryRow[]);
      setLoading(false);
    })();
  }, [documentTable, documentId]);

  return { history, loading };
}
