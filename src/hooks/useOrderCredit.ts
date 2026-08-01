import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface CreditValidationRow {
  id: string;
  validation_time: string;
  credit_limit: number | null;
  outstanding_balance: number | null;
  overdue_balance: number | null;
  current_order_credit_amount: number | null;
  available_credit_before: number | null;
  available_credit_after: number | null;
  status: string;
  block_reason: string | null;
  override_required: boolean;
}

export function useOrderCreditValidation(orderId: string | undefined) {
  const [rows, setRows] = useState<CreditValidationRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    const { data } = await supabase.from('sales_order_credit_validations').select('*').eq('order_id', orderId).order('validation_time', { ascending: false });
    setRows((data ?? []) as CreditValidationRow[]);
    setLoading(false);
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  const runValidation = useCallback(async () => {
    if (!orderId) return { error: 'No order' };
    const { error } = await supabase.rpc('validate_order_credit', { p_order_id: orderId });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [orderId, load]);

  return { rows, loading, reload: load, runValidation };
}

export interface CreditReservation {
  id: string;
  reserved_amount: number;
  status: string;
  expiry_date: string | null;
  remaining_amount: number;
  created_at: string;
}

export function useOrderCreditReservation(orderId: string | undefined) {
  const [reservation, setReservation] = useState<CreditReservation | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    const { data } = await supabase.from('sales_order_credit_reservations').select('*').eq('order_id', orderId).maybeSingle();
    setReservation(data as CreditReservation | null);
    setLoading(false);
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  const reserve = useCallback(async (expiry?: string) => {
    if (!orderId) return { error: 'No order' };
    const { error } = await supabase.rpc('create_credit_reservation', { p_order_id: orderId, p_expiry: expiry ?? null });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [orderId, load]);

  const release = useCallback(async (reason: string) => {
    if (!orderId) return { error: 'No order' };
    const { error } = await supabase.rpc('release_credit_reservation', { p_order_id: orderId, p_reason: reason });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [orderId, load]);

  return { reservation, loading, reload: load, reserve, release };
}

export interface CreditOverrideRequest {
  id: string;
  credit_limit: number | null;
  available_credit: number | null;
  order_credit_amount: number | null;
  excess_amount: number | null;
  reason: string | null;
  approval_level: string;
  status: string;
  requested_date: string;
}

export function useOrderCreditOverrides(orderId: string | undefined) {
  const [requests, setRequests] = useState<CreditOverrideRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    const { data } = await supabase.from('sales_order_credit_override_requests').select('*').eq('order_id', orderId).order('requested_date', { ascending: false });
    setRequests((data ?? []) as CreditOverrideRequest[]);
    setLoading(false);
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  const requestOverride = useCallback(async (reason: string, approvalLevel = 'supervisor') => {
    if (!orderId) return { error: 'No order' };
    const { error } = await supabase.rpc('request_credit_override', { p_order_id: orderId, p_reason: reason, p_approval_level: approvalLevel });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [orderId, load]);

  const decide = useCallback(async (requestId: string, approve: boolean, reason?: string) => {
    const { error } = await supabase.rpc('decide_credit_override', { p_request_id: requestId, p_approve: approve, p_reason: reason ?? null });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  return { requests, loading, reload: load, requestOverride, decide };
}
