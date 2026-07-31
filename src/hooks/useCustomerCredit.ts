import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type CreditType = 'cash' | 'credit' | 'hybrid';
export type CreditStatus = 'normal' | 'warning' | 'near_limit' | 'over_limit' | 'blocked' | 'suspended' | 'inactive';

export interface CustomerCreditProfile {
  id: string;
  customer_id: string;
  credit_type: CreditType;
  credit_status: CreditStatus;
  credit_limit: number;
  temporary_credit_limit: number | null;
  temporary_credit_expiry: string | null;
  credit_days: number;
  grace_days: number;
  risk_level_id: string | null;
  default_payment_term_id: string | null;
  allow_partial_payments: boolean;
  require_approval: boolean;
  require_manager_approval: boolean;
  block_on_overdue: boolean;
  block_on_credit_limit: boolean;
  maximum_outstanding: number | null;
  maximum_pending_orders: number | null;
  maximum_pending_deliveries: number | null;
  credit_notes: string | null;
  is_manually_blocked: boolean;
  manual_block_reason: string | null;
  status: 'active' | 'inactive';
  risk_level?: { id: string; label: string } | null;
  payment_term?: { id: string; label: string } | null;
}

const SELECT = '*, risk_level:customer_risk_levels(id,label), payment_term:payment_terms(id,label)';

export function useCustomerCredit(customerId: string | null) {
  const [profile, setProfile] = useState<CustomerCreditProfile | null>(null);
  const [availableCredit, setAvailableCredit] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!customerId) { setProfile(null); setAvailableCredit(null); setLoading(false); return; }
    setLoading(true);
    const [{ data }, { data: avail }] = await Promise.all([
      supabase.from('customer_credit_profiles').select(SELECT).eq('customer_id', customerId).maybeSingle(),
      supabase.rpc('customer_available_credit', { p_customer_id: customerId }),
    ]);
    setProfile((data as unknown as CustomerCreditProfile) ?? null);
    setAvailableCredit(typeof avail === 'number' ? avail : null);
    setLoading(false);
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  const updateProfile = useCallback(async (patch: Partial<CustomerCreditProfile>) => {
    if (!customerId) return { error: 'No customer selected' };
    const { error } = await supabase.from('customer_credit_profiles').update(patch).eq('customer_id', customerId);
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [customerId, load]);

  const setStatus = useCallback(async (newStatus: CreditStatus, reason?: string) => {
    if (!customerId) return { error: 'No customer selected' };
    const { error } = await supabase.rpc('set_customer_credit_status', { p_customer_id: customerId, p_new_status: newStatus, p_reason: reason || null });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [customerId, load]);

  const changeType = useCallback(async (newType: CreditType, reason?: string) => {
    if (!customerId) return { error: 'No customer selected' };
    const { error } = await supabase.rpc('change_customer_credit_type', { p_customer_id: customerId, p_new_type: newType, p_reason: reason || null });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [customerId, load]);

  const refreshStatus = useCallback(async () => {
    if (!customerId) return;
    await supabase.rpc('refresh_customer_credit_status', { p_customer_id: customerId });
    await load();
  }, [customerId, load]);

  return { profile, availableCredit, loading, reload: load, updateProfile, setStatus, changeType, refreshStatus };
}

export interface CreditValidationResult { check_name: string; passed: boolean; message: string; }

export async function validateCustomerCredit(customerId: string, orderAmount = 0): Promise<CreditValidationResult[]> {
  const { data } = await supabase.rpc('validate_customer_credit', { p_customer_id: customerId, p_order_amount: orderAmount });
  return (data ?? []) as CreditValidationResult[];
}

export interface CreditHistoryEntry {
  id: string; field_name: string; old_value: string | null; new_value: string | null; reason: string | null; changed_at: string;
  changed_by_user?: { full_name: string } | null;
}
export interface CreditStatusHistoryEntry {
  id: string; old_status: string | null; new_status: string; reason: string | null; changed_at: string;
}

export function useCreditHistory(customerId: string | null) {
  const [history, setHistory] = useState<CreditHistoryEntry[]>([]);
  const [statusHistory, setStatusHistory] = useState<CreditStatusHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!customerId) { setHistory([]); setStatusHistory([]); setLoading(false); return; }
    (async () => {
      setLoading(true);
      const [{ data: h }, { data: sh }] = await Promise.all([
        supabase.from('customer_credit_history').select('id, field_name, old_value, new_value, reason, changed_at, changed_by_user:app_users(full_name)').eq('customer_id', customerId).order('changed_at', { ascending: false }),
        supabase.from('customer_credit_status_history').select('id, old_status, new_status, reason, changed_at').eq('customer_id', customerId).order('changed_at', { ascending: false }),
      ]);
      setHistory((h ?? []) as unknown as CreditHistoryEntry[]);
      setStatusHistory((sh ?? []) as CreditStatusHistoryEntry[]);
      setLoading(false);
    })();
  }, [customerId]);

  return { history, statusHistory, loading };
}
