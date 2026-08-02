import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface ReceiptApprovalStep {
  id: string; approval_type: string; sequence: number; required_role: string | null; status: string; reason: string | null; request_time: string;
}

export function useReceiptApprovals(receiptId: string | undefined) {
  const [triggeredBy, setTriggeredBy] = useState<string[]>([]);
  const [overallStatus, setOverallStatus] = useState<string | null>(null);
  const [steps, setSteps] = useState<ReceiptApprovalStep[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!receiptId) return;
    setLoading(true);
    const { data: approval } = await supabase.from('receipt_approvals').select('*').eq('receipt_id', receiptId).maybeSingle();
    if (approval) {
      setTriggeredBy((approval as any).triggered_by ?? []);
      setOverallStatus((approval as any).overall_status);
      const { data: stepRows } = await supabase.from('receipt_approval_steps').select('*').eq('approval_id', (approval as any).id).order('sequence');
      setSteps((stepRows ?? []) as ReceiptApprovalStep[]);
    } else {
      setTriggeredBy([]); setOverallStatus(null); setSteps([]);
    }
    setLoading(false);
  }, [receiptId]);

  useEffect(() => { load(); }, [load]);

  const submitForApproval = useCallback(async () => {
    if (!receiptId) return { error: 'No receipt' };
    const { error } = await supabase.rpc('submit_receipt_for_approval_notified', { p_receipt_id: receiptId });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [receiptId, load]);

  const processAction = useCallback(async (stepId: string, action: string, reason?: string, notes?: string) => {
    const { error } = await supabase.rpc('process_receipt_approval_action_notified', { p_step_id: stepId, p_action: action, p_reason: reason ?? null, p_notes: notes ?? null });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  return { triggeredBy, overallStatus, steps, loading, reload: load, submitForApproval, processAction };
}

export interface ReceiptHoldRecord {
  id: string; hold_reason: string; hold_notes: string | null; held_at: string; released_by: string | null; released_at: string | null;
}

export function useReceiptHold(receiptId: string | undefined) {
  const [history, setHistory] = useState<ReceiptHoldRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!receiptId) return;
    setLoading(true);
    const { data } = await supabase.from('receipt_hold_history').select('*').eq('receipt_id', receiptId).order('held_at', { ascending: false });
    setHistory((data ?? []) as ReceiptHoldRecord[]);
    setLoading(false);
  }, [receiptId]);

  useEffect(() => { load(); }, [load]);

  const placeOnHold = useCallback(async (reason: string, notes?: string) => {
    if (!receiptId) return { error: 'No receipt' };
    const { error } = await supabase.rpc('place_receipt_on_hold_notified', { p_receipt_id: receiptId, p_reason: reason, p_notes: notes ?? null });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [receiptId, load]);

  const releaseHold = useCallback(async (holdId: string, notes?: string) => {
    const { error } = await supabase.rpc('release_receipt_hold_notified', { p_hold_id: holdId, p_notes: notes ?? null });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  return { history, loading, reload: load, placeOnHold, releaseHold };
}

export function useReceiptPosting() {
  const [posting, setPosting] = useState(false);

  const postReceipt = useCallback(async (receiptId: string) => {
    setPosting(true);
    const { data, error } = await supabase.rpc('post_receipt_notified', { p_receipt_id: receiptId });
    setPosting(false);
    if (error) return { error: error.message };
    return { data };
  }, []);

  const retryPosting = useCallback(async (receiptId: string) => {
    setPosting(true);
    const { data, error } = await supabase.rpc('retry_failed_receipt_posting', { p_receipt_id: receiptId });
    setPosting(false);
    if (error) return { error: error.message };
    return { data };
  }, []);

  return { posting, postReceipt, retryPosting };
}

export interface ReceiptPostingHistoryRow {
  id: string; attempt_number: number; status: string; error_message: string | null; final_receipt_number: string | null; attempted_at: string; online: boolean;
}

export function useReceiptPostingHistory(receiptId: string | undefined) {
  const [history, setHistory] = useState<ReceiptPostingHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!receiptId) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase.from('receipt_posting_history').select('*').eq('receipt_id', receiptId).order('attempted_at', { ascending: false });
      setHistory((data ?? []) as ReceiptPostingHistoryRow[]);
      setLoading(false);
    })();
  }, [receiptId]);

  return { history, loading };
}

export interface ReceiptReversalRequest {
  id: string; reason: string; approval_status: string; request_date: string; decision_reason: string | null;
}

export function useReceiptReversal(receiptId: string | undefined) {
  const [request, setRequest] = useState<ReceiptReversalRequest | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!receiptId) return;
    setLoading(true);
    const { data } = await supabase.from('receipt_reversal_requests').select('*').eq('receipt_id', receiptId).order('request_date', { ascending: false }).limit(1).maybeSingle();
    setRequest(data as ReceiptReversalRequest | null);
    setLoading(false);
  }, [receiptId]);

  useEffect(() => { load(); }, [load]);

  const createReversalRequest = useCallback(async (reason: string) => {
    if (!receiptId) return { error: 'No receipt' };
    const { error } = await supabase.rpc('create_receipt_reversal_request_notified', { p_receipt_id: receiptId, p_reason: reason });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [receiptId, load]);

  return { request, loading, reload: load, createReversalRequest };
}
