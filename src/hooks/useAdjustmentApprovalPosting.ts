import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type AdjustmentDocumentTable = 'credit_notes' | 'debit_notes' | 'customer_adjustments';

export interface AdjustmentApprovalStep {
  id: string; approval_type: string; sequence: number; required_role: string | null; status: string; reason: string | null; request_date: string;
}

export function useAdjustmentApprovals(documentTable: AdjustmentDocumentTable, documentId: string | undefined) {
  const [overallStatus, setOverallStatus] = useState<string | null>(null);
  const [steps, setSteps] = useState<AdjustmentApprovalStep[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!documentId) return;
    setLoading(true);
    const { data: approval } = await supabase.from('financial_adjustment_approvals').select('*').eq('document_table', documentTable).eq('document_id', documentId).maybeSingle();
    if (approval) {
      setOverallStatus((approval as any).overall_status);
      const { data: stepRows } = await supabase.from('financial_adjustment_approval_steps').select('*').eq('approval_id', (approval as any).id).order('sequence');
      setSteps((stepRows ?? []) as AdjustmentApprovalStep[]);
    } else {
      setOverallStatus(null); setSteps([]);
    }
    setLoading(false);
  }, [documentTable, documentId]);

  useEffect(() => { load(); }, [load]);

  const submitForApproval = useCallback(async () => {
    if (!documentId) return { error: 'No document' };
    const { error } = await supabase.rpc('submit_adjustment_for_approval_notified', { p_document_table: documentTable, p_document_id: documentId });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [documentTable, documentId, load]);

  const processAction = useCallback(async (stepId: string, action: string, reason?: string, notes?: string) => {
    const { error } = await supabase.rpc('process_adjustment_approval_action_notified', { p_step_id: stepId, p_action: action, p_reason: reason ?? null, p_notes: notes ?? null });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  return { overallStatus, steps, loading, reload: load, submitForApproval, processAction };
}

export function useAdjustmentPosting(documentTable: AdjustmentDocumentTable) {
  const [posting, setPosting] = useState(false);

  const rpcName = documentTable === 'credit_notes' ? 'post_credit_note_notified' : documentTable === 'debit_notes' ? 'post_debit_note_notified' : 'post_customer_adjustment_notified';

  const post = useCallback(async (id: string) => {
    setPosting(true);
    const { data, error } = await supabase.rpc(rpcName, { p_id: id });
    setPosting(false);
    if (error) return { error: error.message };
    return { data };
  }, [rpcName]);

  const retry = useCallback(async (id: string) => {
    setPosting(true);
    const { data, error } = await supabase.rpc('retry_failed_adjustment_posting', { p_document_table: documentTable, p_id: id });
    setPosting(false);
    if (error) return { error: error.message };
    return { data };
  }, [documentTable]);

  return { posting, post, retry };
}

export interface AdjustmentPostingHistoryRow {
  id: string; attempt_number: number; status: string; error_message: string | null; final_document_number: string | null;
  invoice_credited_amount: number; unallocated_amount: number; attempted_at: string; online: boolean;
}

export function useAdjustmentPostingHistory(documentTable: AdjustmentDocumentTable, documentId: string | undefined) {
  const [history, setHistory] = useState<AdjustmentPostingHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!documentId) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase.from('customer_adjustment_posting_history').select('*').eq('document_table', documentTable).eq('document_id', documentId).order('attempted_at', { ascending: false });
      setHistory((data ?? []) as unknown as AdjustmentPostingHistoryRow[]);
      setLoading(false);
    })();
  }, [documentTable, documentId]);

  return { history, loading };
}

export interface AdjustmentReversalRequest {
  id: string; reason: string; approval_status: string; request_date: string; decision_reason: string | null;
  reversed_credited_amount: number; reversed_unallocated_amount: number;
}

export function useAdjustmentReversal(documentTable: AdjustmentDocumentTable, documentId: string | undefined) {
  const [request, setRequest] = useState<AdjustmentReversalRequest | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!documentId) return;
    setLoading(true);
    const { data } = await supabase.from('customer_adjustment_reversals').select('*').eq('document_table', documentTable).eq('document_id', documentId).order('request_date', { ascending: false }).limit(1).maybeSingle();
    setRequest(data as AdjustmentReversalRequest | null);
    setLoading(false);
  }, [documentTable, documentId]);

  useEffect(() => { load(); }, [load]);

  const createReversalRequest = useCallback(async (reason: string) => {
    if (!documentId) return { error: 'No document' };
    const { error } = await supabase.rpc('create_adjustment_reversal_request_notified', { p_document_table: documentTable, p_document_id: documentId, p_reason: reason });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [documentTable, documentId, load]);

  return { request, loading, reload: load, createReversalRequest };
}
