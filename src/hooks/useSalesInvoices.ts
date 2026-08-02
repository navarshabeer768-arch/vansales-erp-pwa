import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export type SalesInvoiceStatus =
  | 'draft' | 'pending_validation' | 'validation_failed' | 'pending_submission' | 'pending_approval'
  | 'partially_approved' | 'approved' | 'returned_for_correction' | 'on_hold' | 'ready_to_post'
  | 'posting' | 'posted' | 'posting_failed' | 'cancelled_before_posting' | 'void_requested' | 'voided'
  | 'sync_pending' | 'sync_failed' | 'conflict' | 'submitted' | 'expired';

export interface SalesInvoiceRow {
  id: string;
  invoice_number: string;
  invoice_date: string;
  status: SalesInvoiceStatus;
  net_amount: number;
  total_quantity: number;
  payment_type: string;
  customer: { customer_code: string; business_name: string; primary_phone: string | null } | null;
  walk_in_name: string | null;
  invoice_type: { code: string; label: string } | null;
  van: { code: string; name: string } | null;
  salesman: { full_name: string } | null;
  sales_order_id: string | null;
}

export interface SalesInvoiceFilters {
  dateFrom?: string;
  dateTo?: string;
  status?: SalesInvoiceStatus;
  vanId?: string;
  salesmanId?: string;
  routeId?: string;
}

export function useSalesInvoices(filters: SalesInvoiceFilters = {}) {
  const { company } = useAuth();
  const [invoices, setInvoices] = useState<SalesInvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    let query = supabase
      .from('sales_invoices')
      .select(`
        id, invoice_number, invoice_date, status, net_amount, total_quantity, payment_type, walk_in_name, sales_order_id,
        customer:customers(customer_code, business_name, primary_phone),
        invoice_type:sales_invoice_types(code, label),
        van:vans(code, name),
        salesman:app_users!sales_invoices_salesman_id_fkey(full_name)
      `)
      .eq('company_id', company.id)
      .order('invoice_date', { ascending: false });

    if (filters.dateFrom) query = query.gte('invoice_date', filters.dateFrom);
    if (filters.dateTo) query = query.lte('invoice_date', filters.dateTo);
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.vanId) query = query.eq('van_id', filters.vanId);
    if (filters.salesmanId) query = query.eq('salesman_id', filters.salesmanId);
    if (filters.routeId) query = query.eq('route_id', filters.routeId);

    const { data } = await query;
    setInvoices((data ?? []) as unknown as SalesInvoiceRow[]);
    setLoading(false);
  }, [company, filters.dateFrom, filters.dateTo, filters.status, filters.vanId, filters.salesmanId, filters.routeId]);

  useEffect(() => { load(); }, [load]);

  const submitInvoice = useCallback(async (invoiceId: string) => {
    const { error } = await supabase.rpc('change_sales_invoice_status_notified', { p_invoice_id: invoiceId, p_new_status: 'submitted' });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  const cancelInvoice = useCallback(async (invoiceId: string, reason: string) => {
    const { error } = await supabase.rpc('cancel_sales_invoice', { p_invoice_id: invoiceId, p_reason: reason });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  const deleteDraft = useCallback(async (invoiceId: string) => {
    const { error } = await supabase.rpc('delete_unsynced_invoice_draft', { p_invoice_id: invoiceId });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  const createRepeatInvoice = useCallback(async (sourceInvoiceId: string) => {
    const clientUuid = `repeat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { data, error } = await supabase.rpc('create_repeat_invoice_draft', { p_source_invoice_id: sourceInvoiceId, p_client_uuid: clientUuid });
    if (error) return { error: error.message };
    await load();
    return { data: data as string };
  }, [load]);

  return { invoices, loading, reload: load, submitInvoice, cancelInvoice, deleteDraft, createRepeatInvoice };
}
