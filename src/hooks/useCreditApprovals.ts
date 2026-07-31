import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export type CreditRequestType = 'credit_increase' | 'temporary_credit' | 'risk_change' | 'customer_type_change';
export type CreditApprovalStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'cancelled' | 'expired';

export interface CreditApproval {
  id: string;
  customer_id: string;
  request_type: CreditRequestType;
  old_value: string | null;
  new_value: string | null;
  reason: string | null;
  expiry_date: string | null;
  status: CreditApprovalStatus;
  requested_by: string | null;
  approved_by: string | null;
  rejected_by: string | null;
  decision_reason: string | null;
  created_at: string;
  decided_at: string | null;
  customer?: { id: string; business_name: string } | null;
  requester?: { full_name: string } | null;
}

const SELECT = '*, customer:customers(id,business_name), requester:app_users!customer_credit_approvals_requested_by_fkey(full_name)';

export function useCreditApprovals(customerId?: string | null) {
  const { company } = useAuth();
  const [approvals, setApprovals] = useState<CreditApproval[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    let query = supabase.from('customer_credit_approvals').select(SELECT).eq('company_id', company.id);
    if (customerId) query = query.eq('customer_id', customerId);
    const { data } = await query.order('created_at', { ascending: false });
    setApprovals((data ?? []) as unknown as CreditApproval[]);
    setLoading(false);
  }, [company, customerId]);

  useEffect(() => { load(); }, [load]);

  const submit = useCallback(async (params: {
    customerId: string; requestType: CreditRequestType; newValue: string; reason?: string; expiryDate?: string;
  }) => {
    const { error } = await supabase.rpc('submit_credit_approval', {
      p_customer_id: params.customerId, p_request_type: params.requestType, p_new_value: params.newValue,
      p_reason: params.reason || null, p_expiry_date: params.expiryDate || null,
    });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  const decide = useCallback(async (approvalId: string, approve: boolean, reason?: string) => {
    const { error } = await supabase.rpc('decide_credit_approval', { p_approval_id: approvalId, p_approve: approve, p_reason: reason || null });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  const cancel = useCallback(async (approvalId: string) => {
    const { error } = await supabase.rpc('cancel_credit_approval', { p_approval_id: approvalId });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  const pending = approvals.filter((a) => a.status === 'pending');

  return { approvals, pending, loading, reload: load, submit, decide, cancel };
}
