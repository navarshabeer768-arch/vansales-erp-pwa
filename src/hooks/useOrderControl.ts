import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface HoldRecord {
  id: string;
  hold_reason: string;
  hold_notes: string | null;
  held_time: string;
  released_by: string | null;
  release_time: string | null;
  release_notes: string | null;
}

export function useOrderHold(orderId: string | undefined) {
  const [history, setHistory] = useState<HoldRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    const { data } = await supabase.from('sales_order_hold_history').select('*').eq('order_id', orderId).order('held_time', { ascending: false });
    setHistory((data ?? []) as HoldRecord[]);
    setLoading(false);
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  const placeOnHold = useCallback(async (reason: string, notes?: string) => {
    if (!orderId) return { error: 'No order' };
    const { error } = await supabase.rpc('place_order_on_hold', { p_order_id: orderId, p_reason: reason, p_notes: notes ?? null });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [orderId, load]);

  const releaseHold = useCallback(async (holdId: string, notes?: string) => {
    const { error } = await supabase.rpc('release_order_hold', { p_hold_id: holdId, p_notes: notes ?? null });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  return { history, loading, reload: load, placeOnHold, releaseHold };
}

export interface OrderBackorder {
  id: string;
  order_item_id: string;
  product_id: string;
  backorder_quantity: number;
  status: string;
  priority: string;
  required_date: string | null;
  product?: { name: string } | null;
}

export function useOrderBackorders(orderId: string | undefined) {
  const [backorders, setBackorders] = useState<OrderBackorder[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    const { data } = await supabase.from('sales_order_backorders').select('*, product:products(name)').eq('order_id', orderId).order('created_at', { ascending: false });
    setBackorders((data ?? []) as unknown as OrderBackorder[]);
    setLoading(false);
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  const createForItem = useCallback(async (orderItemId: string, quantity: number, requiredDate?: string, priority = 'medium', reason?: string) => {
    const { error } = await supabase.rpc('create_backorder', {
      p_order_item_id: orderItemId, p_backorder_quantity: quantity, p_required_date: requiredDate ?? null, p_priority: priority, p_reason: reason ?? null,
    });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  return { backorders, loading, reload: load, createForItem };
}

export function useOrderCancellation() {
  const cancelOrder = useCallback(async (orderId: string, reason: string, notes?: string) => {
    const { error } = await supabase.rpc('cancel_sales_order', { p_order_id: orderId, p_reason: reason, p_notes: notes ?? null });
    if (error) return { error: error.message };
    return { data: true };
  }, []);

  const partiallyCancelItem = useCallback(async (orderItemId: string, quantity: number, reason: string) => {
    const { error } = await supabase.rpc('partially_cancel_order_item', { p_order_item_id: orderItemId, p_cancel_quantity: quantity, p_reason: reason });
    if (error) return { error: error.message };
    return { data: true };
  }, []);

  return { cancelOrder, partiallyCancelItem };
}

export interface OrderAmendment {
  id: string;
  amendment_number: string;
  version: number;
  reason: string;
  status: string;
  request_date: string;
  decided_at: string | null;
}

export function useOrderAmendments(orderId: string | undefined) {
  const [amendments, setAmendments] = useState<OrderAmendment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    const { data } = await supabase.from('sales_order_amendments').select('*').eq('order_id', orderId).order('request_date', { ascending: false });
    setAmendments((data ?? []) as OrderAmendment[]);
    setLoading(false);
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  const createAmendment = useCallback(async (reason: string, changes: unknown[]) => {
    if (!orderId) return { error: 'No order' };
    const { error } = await supabase.rpc('create_order_amendment', { p_order_id: orderId, p_reason: reason, p_changes: changes });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [orderId, load]);

  const approveAmendment = useCallback(async (amendmentId: string, reason?: string) => {
    const { error } = await supabase.rpc('approve_order_amendment', { p_amendment_id: amendmentId, p_reason: reason ?? null });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  return { amendments, loading, reload: load, createAmendment, approveAmendment };
}

export function useSyncConflicts(orderId: string | undefined) {
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    const { data } = await supabase.from('sales_order_sync_conflicts').select('*').eq('order_id', orderId).order('detected_at', { ascending: false });
    setConflicts(data ?? []);
    setLoading(false);
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  const resolve = useCallback(async (conflictId: string, resolution: string, notes?: string) => {
    const { error } = await supabase.rpc('resolve_sync_conflict', { p_conflict_id: conflictId, p_resolution: resolution, p_notes: notes ?? null });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  return { conflicts, loading, reload: load, resolve };
}
