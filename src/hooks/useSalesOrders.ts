import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export type SalesOrderStatus =
  | 'draft' | 'pending_validation' | 'validation_failed' | 'pending_submission' | 'submitted'
  | 'pending_approval' | 'partially_approved' | 'approved' | 'rejected' | 'returned_for_correction' | 'on_hold'
  | 'ready_for_reservation' | 'partially_reserved' | 'fully_reserved' | 'backordered' | 'ready_for_fulfilment'
  | 'partially_converted' | 'fully_converted' | 'cancelled' | 'expired' | 'closed'
  | 'sync_pending' | 'sync_failed' | 'conflict';

export interface SalesOrderRow {
  id: string;
  order_number: string;
  order_date: string;
  status: SalesOrderStatus;
  net_amount: number;
  total_quantity: number;
  customer: { customer_code: string; business_name: string; primary_phone: string | null } | null;
  order_type: { code: string; label: string } | null;
  van: { code: string; name: string } | null;
  salesman: { full_name: string } | null;
  route: { name: string } | null;
}

export interface SalesOrderFilters {
  dateFrom?: string;
  dateTo?: string;
  status?: SalesOrderStatus;
  vanId?: string;
  salesmanId?: string;
  routeId?: string;
  orderTypeCode?: string;
}

export function useSalesOrders(filters: SalesOrderFilters = {}) {
  const { company } = useAuth();
  const [orders, setOrders] = useState<SalesOrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    let query = supabase
      .from('sales_orders')
      .select(`
        id, order_number, order_date, status, net_amount, total_quantity,
        customer:customers(customer_code, business_name, primary_phone),
        order_type:sales_order_types(code, label),
        van:vans(code, name),
        salesman:app_users!sales_orders_salesman_id_fkey(full_name),
        route:routes(name)
      `)
      .eq('company_id', company.id)
      .order('order_date', { ascending: false });

    if (filters.dateFrom) query = query.gte('order_date', filters.dateFrom);
    if (filters.dateTo) query = query.lte('order_date', filters.dateTo);
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.vanId) query = query.eq('van_id', filters.vanId);
    if (filters.salesmanId) query = query.eq('salesman_id', filters.salesmanId);
    if (filters.routeId) query = query.eq('route_id', filters.routeId);
    if (filters.orderTypeCode) query = query.eq('sales_order_types.code', filters.orderTypeCode);

    const { data } = await query;
    setOrders((data ?? []) as unknown as SalesOrderRow[]);
    setLoading(false);
  }, [company, filters.dateFrom, filters.dateTo, filters.status, filters.vanId, filters.salesmanId, filters.routeId, filters.orderTypeCode]);

  useEffect(() => { load(); }, [load]);

  const submitOrder = useCallback(async (orderId: string) => {
    const { error } = await supabase.rpc('submit_order_for_approval_notified', { p_order_id: orderId });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  const cancelOrder = useCallback(async (orderId: string, reason: string) => {
    const { error } = await supabase.rpc('change_sales_order_status', { p_order_id: orderId, p_new_status: 'cancelled', p_reason: reason });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  const deleteDraft = useCallback(async (orderId: string) => {
    const { error } = await supabase.rpc('delete_draft_sales_order', { p_order_id: orderId });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  return { orders, loading, reload: load, submitOrder, cancelOrder, deleteDraft };
}
