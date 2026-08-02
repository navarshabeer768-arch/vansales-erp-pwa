import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface OutstandingSummary {
  total_outstanding: number; total_overdue: number; current_amount: number;
  days_1_30: number; days_31_60: number; days_61_90: number; days_91_120: number; days_120_plus: number;
  unallocated_advance: number; open_invoices: number; partially_paid_invoices: number; overdue_invoices: number;
}

export function useCustomerOutstandingSummary(customerId: string | undefined) {
  const [summary, setSummary] = useState<OutstandingSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!customerId) { setSummary(null); return; }
    setLoading(true);
    const { data } = await supabase.rpc('customer_outstanding_summary', { p_customer_id: customerId });
    setSummary((data?.[0] as OutstandingSummary) ?? null);
    setLoading(false);
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  return { summary, loading, reload: load };
}

export interface OutstandingInvoiceRow {
  invoice_id: string; invoice_number: string; invoice_date: string; due_date: string | null;
  invoice_amount: number; previously_paid_amount: number; outstanding_amount: number; overdue_days: number;
  payment_term: string | null; invoice_type: string | null; route: string | null; van: string | null;
  responsible_employee: string | null; status: string;
}

export function useCustomerOutstandingInvoices(customerId: string | undefined) {
  const [invoices, setInvoices] = useState<OutstandingInvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!customerId) { setInvoices([]); return; }
    setLoading(true);
    const { data } = await supabase.rpc('customer_outstanding_invoices', { p_customer_id: customerId });
    setInvoices((data ?? []) as OutstandingInvoiceRow[]);
    setLoading(false);
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  return { invoices, loading, reload: load };
}

export interface AllocationPreviewRow {
  invoice_id: string; invoice_number: string; outstanding: number; proposed_allocation: number;
  remaining_balance: number; allocation_order: number;
}

export function useAllocationPreview() {
  const [previewing, setPreviewing] = useState(false);

  const preview = useCallback(async (customerId: string, receiptAmount: number, strategy: string) => {
    setPreviewing(true);
    const { data, error } = await supabase.rpc('calculate_allocation_preview', {
      p_customer_id: customerId, p_receipt_amount: receiptAmount, p_strategy: strategy,
    });
    setPreviewing(false);
    if (error) return { error: error.message };
    return { data: (data ?? []) as AllocationPreviewRow[] };
  }, []);

  return { preview, previewing };
}
