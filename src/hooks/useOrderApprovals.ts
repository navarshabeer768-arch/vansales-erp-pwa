import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface ApprovalStep {
  id: string;
  approval_id: string;
  approval_type: string;
  sequence: number;
  required_role: string | null;
  status: string;
  reason: string | null;
  notes: string | null;
  action_time: string | null;
  request_time: string;
  order?: { id: string; order_number: string; net_amount: number; customer?: { business_name: string } | null } | null;
}

export function useOrderApprovals(orderId: string | undefined) {
  const [triggeredBy, setTriggeredBy] = useState<string[]>([]);
  const [overallStatus, setOverallStatus] = useState<string | null>(null);
  const [steps, setSteps] = useState<ApprovalStep[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    const { data: approval } = await supabase.from('sales_order_approvals').select('*').eq('order_id', orderId).maybeSingle();
    if (approval) {
      setTriggeredBy((approval as any).triggered_by ?? []);
      setOverallStatus((approval as any).overall_status);
      const { data: stepRows } = await supabase.from('sales_order_approval_steps').select('*').eq('approval_id', (approval as any).id).order('sequence');
      setSteps((stepRows ?? []) as ApprovalStep[]);
    } else {
      setTriggeredBy([]); setOverallStatus(null); setSteps([]);
    }
    setLoading(false);
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  const processAction = useCallback(async (stepId: string, action: string, reason?: string, notes?: string, partialAdjustments?: unknown) => {
    const { error } = await supabase.rpc('process_approval_action', {
      p_step_id: stepId, p_action: action, p_reason: reason ?? null, p_notes: notes ?? null, p_partial_adjustments: partialAdjustments ?? null,
    });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  return { triggeredBy, overallStatus, steps, loading, reload: load, processAction };
}

// The supervisor-facing queue: every pending step assigned across all
// orders, not scoped to a single order.
export function useApprovalQueue() {
  const { company } = useAuth();
  const [steps, setSteps] = useState<ApprovalStep[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data } = await supabase
      .from('sales_order_approval_steps')
      .select('*, approval:sales_order_approvals!inner(order_id, order:sales_orders(id, order_number, net_amount, customer:customers(business_name)))')
      .eq('company_id', company.id)
      .eq('status', 'pending')
      .order('request_time');
    const rows = (data ?? []) as any[];
    setSteps(rows.map((r) => ({ ...r, order: r.approval?.order })));
    setLoading(false);
  }, [company]);

  useEffect(() => { load(); }, [load]);

  const processAction = useCallback(async (stepId: string, action: string, reason?: string, notes?: string, partialAdjustments?: unknown) => {
    const { error } = await supabase.rpc('process_approval_action', {
      p_step_id: stepId, p_action: action, p_reason: reason ?? null, p_notes: notes ?? null, p_partial_adjustments: partialAdjustments ?? null,
    });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  return { steps, loading, reload: load, processAction };
}
