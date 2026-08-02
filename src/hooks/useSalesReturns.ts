import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export type SalesReturnStatus =
  | 'draft' | 'pending_validation' | 'validation_failed' | 'pending_submission' | 'submitted'
  | 'returned_for_correction' | 'cancelled_before_posting' | 'expired' | 'sync_pending' | 'sync_failed' | 'conflict';

export interface SalesReturnRow {
  id: string;
  return_number: string;
  return_date: string;
  status: SalesReturnStatus;
  validation_status: string;
  net_return_amount: number;
  replacement_requested: boolean;
  customer: { customer_code: string; business_name: string } | null;
  return_type: { code: string; label: string } | null;
  van: { code: string; name: string } | null;
}

export interface ReturnFilters {
  dateFrom?: string;
  dateTo?: string;
  status?: SalesReturnStatus;
  vanId?: string;
  routeId?: string;
}

export function useSalesReturns(filters: ReturnFilters = {}) {
  const { company } = useAuth();
  const [returns, setReturns] = useState<SalesReturnRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    let query = supabase
      .from('sales_returns')
      .select(`
        id, return_number, return_date, status, validation_status, net_return_amount, replacement_requested,
        customer:customers(customer_code, business_name),
        return_type:sales_return_types(code, label),
        van:vans(code, name)
      `)
      .eq('company_id', company.id)
      .order('return_date', { ascending: false });

    if (filters.dateFrom) query = query.gte('return_date', filters.dateFrom);
    if (filters.dateTo) query = query.lte('return_date', filters.dateTo);
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.vanId) query = query.eq('van_id', filters.vanId);
    if (filters.routeId) query = query.eq('route_id', filters.routeId);

    const { data } = await query;
    setReturns((data ?? []) as unknown as SalesReturnRow[]);
    setLoading(false);
  }, [company, filters.dateFrom, filters.dateTo, filters.status, filters.vanId, filters.routeId]);

  useEffect(() => { load(); }, [load]);

  const submitReturn = useCallback(async (returnId: string) => {
    const { error } = await supabase.rpc('change_return_status_notified', { p_return_id: returnId, p_new_status: 'submitted' });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  const cancelReturn = useCallback(async (returnId: string, reason: string) => {
    const { error } = await supabase.rpc('cancel_return_draft', { p_return_id: returnId, p_reason: reason });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  const deleteDraft = useCallback(async (returnId: string) => {
    const { error } = await supabase.rpc('delete_unsynced_return_draft', { p_return_id: returnId });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  return { returns, loading, reload: load, submitReturn, cancelReturn, deleteDraft };
}
