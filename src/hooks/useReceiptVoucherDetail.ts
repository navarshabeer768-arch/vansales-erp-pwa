import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { ReceiptStatus } from './useReceiptVouchers';

export interface ReceiptVoucherDetail {
  id: string;
  receipt_number: string;
  receipt_date: string;
  receipt_time: string;
  status: ReceiptStatus;
  allocation_status: string;
  receipt_amount: number;
  allocated_amount: number;
  unallocated_amount: number;
  advance_amount: number;
  reference_number: string | null;
  customer_reference: string | null;
  remarks: string | null;
  internal_notes: string | null;
  currency: string;
  collection_source: string;
  customer_id: string;
  customer: { customer_code: string; business_name: string } | null;
  collection_type: { code: string; label: string } | null;
  route: { name: string } | null;
  beat_plan: { beat_name: string } | null;
  van: { code: string; name: string } | null;
  responsible_employee: { full_name: string } | null;
}

export interface ReceiptPaymentComponent {
  id: string;
  payment_method_code: string;
  amount: number;
  reference: string | null;
  bank_or_terminal: string | null;
  status: string;
  notes: string | null;
}

export interface ReceiptInvoiceAllocation {
  id: string;
  invoice_id: string;
  invoice_outstanding_snapshot: number;
  allocated_amount: number;
  allocation_method: string;
  status: string;
  invoice?: { invoice_number: string; final_invoice_number: string | null } | null;
}

export function useReceiptVoucherDetail(receiptId: string | undefined) {
  const [receipt, setReceipt] = useState<ReceiptVoucherDetail | null>(null);
  const [components, setComponents] = useState<ReceiptPaymentComponent[]>([]);
  const [allocations, setAllocations] = useState<ReceiptInvoiceAllocation[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!receiptId) return;
    setLoading(true);
    const [{ data: receiptData }, { data: componentsData }, { data: allocationsData }] = await Promise.all([
      supabase.from('receipt_vouchers').select(`
        *, customer:customers(customer_code, business_name), collection_type:collection_types(code, label),
        route:routes(name), beat_plan:beat_plans(beat_name), van:vans(code, name),
        responsible_employee:app_users!receipt_vouchers_responsible_employee_id_fkey(full_name)
      `).eq('id', receiptId).single(),
      supabase.from('receipt_payment_components').select('*').eq('receipt_id', receiptId).order('sequence'),
      supabase.from('receipt_invoice_allocations').select('*, invoice:sales_invoices(invoice_number, final_invoice_number)').eq('receipt_id', receiptId).eq('status', 'active'),
    ]);
    setReceipt(receiptData as unknown as ReceiptVoucherDetail | null);
    setComponents((componentsData ?? []) as ReceiptPaymentComponent[]);
    setAllocations((allocationsData ?? []) as unknown as ReceiptInvoiceAllocation[]);
    setLoading(false);
  }, [receiptId]);

  useEffect(() => { load(); }, [load]);

  return { receipt, components, allocations, loading, reload: load };
}

export interface ReceiptNote {
  id: string; note: string; note_type: string; created_by: string | null; created_at: string;
}

export function useReceiptNotes(receiptId: string | undefined) {
  const { user, company } = useAuth();
  const [notes, setNotes] = useState<ReceiptNote[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!receiptId) return;
    setLoading(true);
    const { data } = await supabase.from('receipt_notes').select('*').eq('receipt_id', receiptId).order('created_at', { ascending: false });
    setNotes((data ?? []) as ReceiptNote[]);
    setLoading(false);
  }, [receiptId]);

  useEffect(() => { load(); }, [load]);

  const addNote = useCallback(async (note: string, noteType: ReceiptNote['note_type'] = 'general') => {
    if (!receiptId || !user || !company) return { error: 'Missing context' };
    const { error } = await supabase.from('receipt_notes').insert({
      receipt_id: receiptId, note, note_type: noteType, created_by: user.id, company_id: company.id,
    });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [receiptId, user, company, load]);

  return { notes, loading, addNote };
}

export interface ReceiptStatusHistoryRow {
  id: string; old_status: string | null; new_status: string; reason: string | null; changed_by: string | null; changed_at: string;
}

export function useReceiptStatusHistory(receiptId: string | undefined) {
  const [history, setHistory] = useState<ReceiptStatusHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!receiptId) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase.from('receipt_status_history').select('*').eq('receipt_id', receiptId).order('changed_at', { ascending: false });
      setHistory((data ?? []) as ReceiptStatusHistoryRow[]);
      setLoading(false);
    })();
  }, [receiptId]);

  return { history, loading };
}
