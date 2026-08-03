import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface ReplacementOrder {
  id: string;
  return_id: string;
  status: string;
  value_rule: string;
  required_date: string | null;
  delivery_status: string;
  created_at: string;
  return?: { return_number: string } | null;
  customer?: { customer_code: string; business_name: string } | null;
}

export interface ReplacementOrderItem {
  id: string;
  product_id: string;
  same_product: boolean;
  approved_quantity: number;
  price_difference: number;
  issued_quantity: number;
  product?: { name: string } | null;
}

export function useReplacementOrders() {
  const { company } = useAuth();
  const [orders, setOrders] = useState<ReplacementOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data } = await supabase
      .from('sales_return_replacement_orders')
      .select('*, return:sales_returns(return_number), customer:customers(customer_code, business_name)')
      .eq('company_id', company.id)
      .not('status', 'in', '(delivered,cancelled,rejected)')
      .order('created_at', { ascending: false });
    setOrders((data ?? []) as unknown as ReplacementOrder[]);
    setLoading(false);
  }, [company]);

  useEffect(() => { load(); }, [load]);

  const processAction = useCallback(async (orderId: string, action: string, reason?: string) => {
    const { error } = await supabase.rpc('process_replacement_order_action', { p_order_id: orderId, p_action: action, p_reason: reason ?? null });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  return { orders, loading, reload: load, processAction };
}

export function useReplacementOrderItems(orderId: string | undefined) {
  const [items, setItems] = useState<ReplacementOrderItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase.from('sales_return_replacement_order_items').select('*, product:products(name)').eq('replacement_order_id', orderId);
      setItems((data ?? []) as unknown as ReplacementOrderItem[]);
      setLoading(false);
    })();
  }, [orderId]);

  return { items, loading };
}

export interface CashRefundRequest {
  id: string;
  return_id: string;
  requested_amount: number;
  reason: string | null;
  approval_status: string;
  created_at: string;
  return?: { return_number: string } | null;
  customer?: { customer_code: string; business_name: string } | null;
}

export function useCashRefundRequests() {
  const { company } = useAuth();
  const [requests, setRequests] = useState<CashRefundRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data } = await supabase
      .from('sales_return_cash_refund_requests')
      .select('*, return:sales_returns(return_number), customer:customers(customer_code, business_name)')
      .eq('company_id', company.id)
      .eq('approval_status', 'pending')
      .order('created_at', { ascending: false });
    setRequests((data ?? []) as unknown as CashRefundRequest[]);
    setLoading(false);
  }, [company]);

  useEffect(() => { load(); }, [load]);

  const decide = useCallback(async (requestId: string, approve: boolean) => {
    const { error } = await supabase.from('sales_return_cash_refund_requests').update({
      approval_status: approve ? 'approved' : 'rejected', decided_at: new Date().toISOString(),
    }).eq('id', requestId);
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  return { requests, loading, reload: load, decide };
}

export interface UnallocatedCreditNote {
  id: string;
  credit_note_number: string;
  approved_credit_amount: number;
  status: string;
  customer_id: string;
  original_invoice_id: string | null;
  customer?: { customer_code: string; business_name: string } | null;
}

export function useUnallocatedCreditNotes() {
  const { company } = useAuth();
  const [notes, setNotes] = useState<UnallocatedCreditNote[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data } = await supabase
      .from('sales_return_credit_notes')
      .select('*, customer:customers(customer_code, business_name)')
      .eq('company_id', company.id)
      .eq('status', 'posted');
    setNotes((data ?? []) as unknown as UnallocatedCreditNote[]);
    setLoading(false);
  }, [company]);

  useEffect(() => { load(); }, [load]);

  const allocate = useCallback(async (creditNoteId: string, invoiceId: string, amount: number) => {
    const { error } = await supabase.rpc('allocate_credit_note_to_invoice', { p_credit_note_id: creditNoteId, p_invoice_id: invoiceId, p_amount: amount });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  return { notes, loading, reload: load, allocate };
}
