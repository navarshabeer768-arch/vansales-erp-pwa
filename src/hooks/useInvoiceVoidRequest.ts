import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface InvoiceVoidRequest {
  id: string;
  invoice_id: string;
  reason: string;
  requested_by: string | null;
  request_date: string;
  approval_status: string;
  decision_reason: string | null;
  decided_at: string | null;
  invoice?: { invoice_number: string; net_amount: number; customer?: { business_name: string } | null } | null;
}

export function useInvoiceVoidRequest(invoiceId: string | undefined) {
  const [request, setRequest] = useState<InvoiceVoidRequest | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!invoiceId) return;
    setLoading(true);
    const { data } = await supabase.from('sales_invoice_void_requests').select('*').eq('invoice_id', invoiceId).order('request_date', { ascending: false }).limit(1).maybeSingle();
    setRequest(data as InvoiceVoidRequest | null);
    setLoading(false);
  }, [invoiceId]);

  useEffect(() => { load(); }, [load]);

  const createVoidRequest = useCallback(async (reason: string) => {
    if (!invoiceId) return { error: 'No invoice' };
    const { error } = await supabase.rpc('create_invoice_void_request_notified', { p_invoice_id: invoiceId, p_reason: reason });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [invoiceId, load]);

  return { request, loading, reload: load, createVoidRequest };
}

export function useVoidRequestQueue() {
  const { company } = useAuth();
  const [requests, setRequests] = useState<InvoiceVoidRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data } = await supabase
      .from('sales_invoice_void_requests')
      .select('*, invoice:sales_invoices(invoice_number, net_amount, customer:customers(business_name))')
      .eq('company_id', company.id)
      .eq('approval_status', 'pending')
      .order('request_date');
    setRequests((data ?? []) as unknown as InvoiceVoidRequest[]);
    setLoading(false);
  }, [company]);

  useEffect(() => { load(); }, [load]);

  const decide = useCallback(async (requestId: string, approve: boolean, reason?: string) => {
    const { error } = await supabase.rpc('decide_invoice_void_request', { p_request_id: requestId, p_approve: approve, p_reason: reason ?? null });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  return { requests, loading, reload: load, decide };
}
