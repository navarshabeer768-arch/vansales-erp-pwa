import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export type ReceiptStatus =
  | 'draft' | 'pending_submission' | 'submitted' | 'returned_for_correction' | 'cancelled_before_posting'
  | 'expired' | 'sync_pending' | 'sync_failed' | 'conflict';

export interface ReceiptVoucherRow {
  id: string;
  receipt_number: string;
  receipt_date: string;
  status: ReceiptStatus;
  allocation_status: string;
  receipt_amount: number;
  allocated_amount: number;
  unallocated_amount: number;
  customer: { customer_code: string; business_name: string } | null;
  collection_type: { code: string; label: string } | null;
  van: { code: string; name: string } | null;
  responsible_employee: { full_name: string } | null;
}

export interface ReceiptFilters {
  dateFrom?: string;
  dateTo?: string;
  status?: ReceiptStatus;
  vanId?: string;
  routeId?: string;
}

export function useReceiptVouchers(filters: ReceiptFilters = {}) {
  const { company } = useAuth();
  const [receipts, setReceipts] = useState<ReceiptVoucherRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    let query = supabase
      .from('receipt_vouchers')
      .select(`
        id, receipt_number, receipt_date, status, allocation_status, receipt_amount, allocated_amount, unallocated_amount,
        customer:customers(customer_code, business_name),
        collection_type:collection_types(code, label),
        van:vans(code, name),
        responsible_employee:app_users!receipt_vouchers_responsible_employee_id_fkey(full_name)
      `)
      .eq('company_id', company.id)
      .order('receipt_date', { ascending: false });

    if (filters.dateFrom) query = query.gte('receipt_date', filters.dateFrom);
    if (filters.dateTo) query = query.lte('receipt_date', filters.dateTo);
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.vanId) query = query.eq('van_id', filters.vanId);
    if (filters.routeId) query = query.eq('route_id', filters.routeId);

    const { data } = await query;
    setReceipts((data ?? []) as unknown as ReceiptVoucherRow[]);
    setLoading(false);
  }, [company, filters.dateFrom, filters.dateTo, filters.status, filters.vanId, filters.routeId]);

  useEffect(() => { load(); }, [load]);

  const submitReceipt = useCallback(async (receiptId: string) => {
    const { error } = await supabase.rpc('change_receipt_status_notified', { p_receipt_id: receiptId, p_new_status: 'submitted' });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  const cancelReceipt = useCallback(async (receiptId: string, reason: string) => {
    const { error } = await supabase.rpc('cancel_receipt_draft', { p_receipt_id: receiptId, p_reason: reason });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  const deleteDraft = useCallback(async (receiptId: string) => {
    const { error } = await supabase.rpc('delete_unsynced_receipt_draft', { p_receipt_id: receiptId });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  return { receipts, loading, reload: load, submitReceipt, cancelReceipt, deleteDraft };
}
