import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface StockValidationRow {
  id: string;
  order_item_id: string | null;
  location_type: 'warehouse' | 'van';
  requested_base_quantity: number;
  available_quantity: number;
  reservable_quantity: number;
  short_quantity: number;
  status: string;
  validation_message: string | null;
  validated_at: string;
}

export function useOrderStockValidation(orderId: string | undefined) {
  const [rows, setRows] = useState<StockValidationRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    const { data } = await supabase.from('sales_order_stock_validations').select('*').eq('order_id', orderId).order('validated_at', { ascending: false });
    setRows((data ?? []) as StockValidationRow[]);
    setLoading(false);
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  const runValidation = useCallback(async () => {
    if (!orderId) return { error: 'No order' };
    const { error } = await supabase.rpc('validate_order_stock', { p_order_id: orderId, p_source: 'manual' });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [orderId, load]);

  return { rows, loading, reload: load, runValidation };
}

export interface StockReservation {
  id: string;
  order_item_id: string;
  location_type: 'warehouse' | 'van';
  requires_batch: boolean;
  requires_serial: boolean;
  reserved_base_quantity: number;
  expiry_date: string | null;
  status: string;
  allocation_method: string;
  remaining_quantity: number;
  created_at: string;
}

export function useOrderStockReservations(orderId: string | undefined) {
  const [reservations, setReservations] = useState<StockReservation[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    const { data } = await supabase.from('sales_order_stock_reservations').select('*').eq('order_id', orderId).order('created_at', { ascending: false });
    setReservations((data ?? []) as StockReservation[]);
    setLoading(false);
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  const reserveItem = useCallback(async (orderItemId: string) => {
    const { data, error } = await supabase.rpc('create_stock_reservation', { p_order_item_id: orderItemId });
    if (error) return { error: error.message };
    await load();
    return { data };
  }, [load]);

  const release = useCallback(async (reservationId: string, reason: string) => {
    const { error } = await supabase.rpc('release_stock_reservation', { p_reservation_id: reservationId, p_reason: reason });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  const extend = useCallback(async (reservationId: string, newExpiry: string, reason: string) => {
    const { error } = await supabase.rpc('extend_stock_reservation', { p_reservation_id: reservationId, p_new_expiry: newExpiry, p_reason: reason });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  return { reservations, loading, reload: load, reserveItem, release, extend };
}
