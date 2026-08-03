import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface ReturnApprovalStep {
  id: string; approval_type: string; sequence: number; required_role: string | null; status: string; reason: string | null; request_date: string;
}

export function useReturnApprovals(returnId: string | undefined) {
  const [triggeredBy, setTriggeredBy] = useState<string[]>([]);
  const [overallStatus, setOverallStatus] = useState<string | null>(null);
  const [steps, setSteps] = useState<ReturnApprovalStep[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!returnId) return;
    setLoading(true);
    const { data: approval } = await supabase.from('sales_return_approvals').select('*').eq('return_id', returnId).maybeSingle();
    if (approval) {
      setTriggeredBy((approval as any).triggered_by ?? []);
      setOverallStatus((approval as any).overall_status);
      const { data: stepRows } = await supabase.from('sales_return_approval_steps').select('*').eq('approval_id', (approval as any).id).order('sequence');
      setSteps((stepRows ?? []) as ReturnApprovalStep[]);
    } else {
      setTriggeredBy([]); setOverallStatus(null); setSteps([]);
    }
    setLoading(false);
  }, [returnId]);

  useEffect(() => { load(); }, [load]);

  const submitForApproval = useCallback(async () => {
    if (!returnId) return { error: 'No return' };
    const { error } = await supabase.rpc('submit_return_for_approval_notified', { p_return_id: returnId });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [returnId, load]);

  const processAction = useCallback(async (stepId: string, action: string, reason?: string, notes?: string) => {
    const { error } = await supabase.rpc('process_return_approval_action_notified', { p_step_id: stepId, p_action: action, p_reason: reason ?? null, p_notes: notes ?? null });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  return { triggeredBy, overallStatus, steps, loading, reload: load, submitForApproval, processAction };
}

export interface ReturnHoldRecord {
  id: string; hold_reason: string; hold_notes: string | null; held_at: string; released_by: string | null; released_at: string | null;
}

export function useReturnHold(returnId: string | undefined) {
  const [history, setHistory] = useState<ReturnHoldRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!returnId) return;
    setLoading(true);
    const { data } = await supabase.from('sales_return_hold_history').select('*').eq('return_id', returnId).order('held_at', { ascending: false });
    setHistory((data ?? []) as ReturnHoldRecord[]);
    setLoading(false);
  }, [returnId]);

  useEffect(() => { load(); }, [load]);

  const placeOnHold = useCallback(async (reason: string, notes?: string) => {
    if (!returnId) return { error: 'No return' };
    const { error } = await supabase.rpc('place_return_on_hold_notified', { p_return_id: returnId, p_reason: reason, p_notes: notes ?? null });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [returnId, load]);

  const releaseHold = useCallback(async (holdId: string, notes?: string) => {
    const { error } = await supabase.rpc('release_return_hold_notified', { p_hold_id: holdId, p_notes: notes ?? null });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  return { history, loading, reload: load, placeOnHold, releaseHold };
}

export interface ReturnInspectionItem {
  id: string;
  return_item_id: string;
  requested_quantity: number;
  inspected_quantity: number;
  accepted_saleable_quantity: number;
  accepted_damaged_quantity: number;
  accepted_expired_quantity: number;
  quarantine_quantity: number;
  rejected_quantity: number;
  condition_code: string | null;
  saleable_status: string | null;
  return_item?: { product?: { name: string } | null } | null;
}

export function useReturnInspection(returnId: string | undefined) {
  const [inspectionId, setInspectionId] = useState<string | null>(null);
  const [inspectionStatus, setInspectionStatus] = useState<string | null>(null);
  const [items, setItems] = useState<ReturnInspectionItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!returnId) return;
    setLoading(true);
    const { data: inspection } = await supabase.from('sales_return_inspections').select('*').eq('return_id', returnId).maybeSingle();
    if (inspection) {
      setInspectionId((inspection as any).id);
      setInspectionStatus((inspection as any).status);
      const { data: itemRows } = await supabase
        .from('sales_return_inspection_items')
        .select('*, return_item:sales_return_items(product:products(name))')
        .eq('inspection_id', (inspection as any).id);
      setItems((itemRows ?? []) as unknown as ReturnInspectionItem[]);
    } else {
      setInspectionId(null); setInspectionStatus(null); setItems([]);
    }
    setLoading(false);
  }, [returnId]);

  useEffect(() => { load(); }, [load]);

  const startInspection = useCallback(async (location?: string) => {
    if (!returnId) return { error: 'No return' };
    const { error } = await supabase.rpc('create_return_inspection', { p_return_id: returnId, p_inspection_location: location ?? null });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [returnId, load]);

  const recordResult = useCallback(async (inspectionItemId: string, params: {
    inspectedQuantity: number; acceptedSaleable?: number; acceptedDamaged?: number; acceptedExpired?: number;
    quarantine?: number; rejected?: number; conditionCode?: string; damageSeverity?: string; saleableStatus?: string;
    expiryDate?: string; rejectedReason?: string; notes?: string;
  }) => {
    const { error } = await supabase.rpc('record_inspection_item_result', {
      p_inspection_item_id: inspectionItemId, p_inspected_quantity: params.inspectedQuantity,
      p_accepted_saleable: params.acceptedSaleable ?? 0, p_accepted_damaged: params.acceptedDamaged ?? 0,
      p_accepted_expired: params.acceptedExpired ?? 0, p_quarantine: params.quarantine ?? 0, p_rejected: params.rejected ?? 0,
      p_condition_code: params.conditionCode ?? null, p_damage_severity: params.damageSeverity ?? null,
      p_saleable_status: params.saleableStatus ?? null, p_expiry_date: params.expiryDate ?? null,
      p_rejected_reason: params.rejectedReason ?? null, p_notes: params.notes ?? null,
    });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  const completeInspection = useCallback(async () => {
    if (!returnId) return { error: 'No return' };
    const { error } = await supabase.rpc('complete_return_inspection_notified', { p_return_id: returnId });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [returnId, load]);

  return { inspectionId, inspectionStatus, items, loading, reload: load, startInspection, recordResult, completeInspection };
}

export function useReturnPosting() {
  const [posting, setPosting] = useState(false);

  const postReturn = useCallback(async (returnId: string) => {
    setPosting(true);
    const { data, error } = await supabase.rpc('post_return_notified', { p_return_id: returnId });
    setPosting(false);
    if (error) return { error: error.message };
    return { data };
  }, []);

  const retryPosting = useCallback(async (returnId: string) => {
    setPosting(true);
    const { data, error } = await supabase.rpc('retry_failed_return_posting', { p_return_id: returnId });
    setPosting(false);
    if (error) return { error: error.message };
    return { data };
  }, []);

  return { posting, postReturn, retryPosting };
}

export interface ReturnPostingHistoryRow {
  id: string; attempt_number: number; status: string; error_message: string | null; final_return_number: string | null; attempted_at: string; online: boolean;
}

export function useReturnPostingHistory(returnId: string | undefined) {
  const [history, setHistory] = useState<ReturnPostingHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!returnId) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase.from('sales_return_posting_history').select('*').eq('return_id', returnId).order('attempted_at', { ascending: false });
      setHistory((data ?? []) as ReturnPostingHistoryRow[]);
      setLoading(false);
    })();
  }, [returnId]);

  return { history, loading };
}
