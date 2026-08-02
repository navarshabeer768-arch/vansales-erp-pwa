import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface InvoiceStockValidationRow {
  id: string; invoice_item_id: string | null; location_type: string;
  requested_base_quantity: number; available_quantity: number; short_quantity: number; status: string; validation_message: string | null;
}

export function useInvoiceStockValidation(invoiceId: string | undefined) {
  const [rows, setRows] = useState<InvoiceStockValidationRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!invoiceId) return;
    setLoading(true);
    const { data } = await supabase.from('sales_invoice_stock_validations').select('*').eq('invoice_id', invoiceId).order('validated_at', { ascending: false });
    setRows((data ?? []) as InvoiceStockValidationRow[]);
    setLoading(false);
  }, [invoiceId]);

  useEffect(() => { load(); }, [load]);

  const runValidation = useCallback(async () => {
    if (!invoiceId) return { error: 'No invoice' };
    const { error } = await supabase.rpc('validate_invoice_stock', { p_invoice_id: invoiceId });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [invoiceId, load]);

  return { rows, loading, reload: load, runValidation };
}

export interface InvoiceCreditValidationRow {
  id: string; validation_time: string; credit_limit: number | null; outstanding_balance: number | null;
  invoice_credit_amount: number | null; available_credit_before: number | null; available_credit_after: number | null;
  status: string; block_reason: string | null; override_required: boolean;
}

export function useInvoiceCreditValidation(invoiceId: string | undefined) {
  const [rows, setRows] = useState<InvoiceCreditValidationRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!invoiceId) return;
    setLoading(true);
    const { data } = await supabase.from('sales_invoice_credit_validations').select('*').eq('invoice_id', invoiceId).order('validation_time', { ascending: false });
    setRows((data ?? []) as InvoiceCreditValidationRow[]);
    setLoading(false);
  }, [invoiceId]);

  useEffect(() => { load(); }, [load]);

  const runValidation = useCallback(async () => {
    if (!invoiceId) return { error: 'No invoice' };
    const { error } = await supabase.rpc('validate_invoice_credit', { p_invoice_id: invoiceId });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [invoiceId, load]);

  const requestOverride = useCallback(async (reason: string, approvalLevel = 'supervisor') => {
    if (!invoiceId) return { error: 'No invoice' };
    const { error } = await supabase.rpc('request_invoice_credit_override', { p_invoice_id: invoiceId, p_reason: reason, p_approval_level: approvalLevel });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [invoiceId, load]);

  return { rows, loading, reload: load, runValidation, requestOverride };
}

export interface InvoiceApprovalStep {
  id: string; approval_type: string; sequence: number; required_role: string | null; status: string; reason: string | null; request_time: string;
}

export function useInvoiceApprovals(invoiceId: string | undefined) {
  const [triggeredBy, setTriggeredBy] = useState<string[]>([]);
  const [overallStatus, setOverallStatus] = useState<string | null>(null);
  const [steps, setSteps] = useState<InvoiceApprovalStep[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!invoiceId) return;
    setLoading(true);
    const { data: approval } = await supabase.from('sales_invoice_approvals').select('*').eq('invoice_id', invoiceId).maybeSingle();
    if (approval) {
      setTriggeredBy((approval as any).triggered_by ?? []);
      setOverallStatus((approval as any).overall_status);
      const { data: stepRows } = await supabase.from('sales_invoice_approval_steps').select('*').eq('approval_id', (approval as any).id).order('sequence');
      setSteps((stepRows ?? []) as InvoiceApprovalStep[]);
    } else {
      setTriggeredBy([]); setOverallStatus(null); setSteps([]);
    }
    setLoading(false);
  }, [invoiceId]);

  useEffect(() => { load(); }, [load]);

  const submitForApproval = useCallback(async () => {
    if (!invoiceId) return { error: 'No invoice' };
    const { error } = await supabase.rpc('submit_invoice_for_approval_notified', { p_invoice_id: invoiceId });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [invoiceId, load]);

  const processAction = useCallback(async (stepId: string, action: string, reason?: string, notes?: string) => {
    const { error } = await supabase.rpc('process_invoice_approval_action_notified', { p_step_id: stepId, p_action: action, p_reason: reason ?? null, p_notes: notes ?? null });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  return { triggeredBy, overallStatus, steps, loading, reload: load, submitForApproval, processAction };
}

export interface InvoiceHoldRecord {
  id: string; hold_reason: string; hold_notes: string | null; held_at: string; released_by: string | null; released_at: string | null;
}

export function useInvoiceHold(invoiceId: string | undefined) {
  const [history, setHistory] = useState<InvoiceHoldRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!invoiceId) return;
    setLoading(true);
    const { data } = await supabase.from('sales_invoice_hold_history').select('*').eq('invoice_id', invoiceId).order('held_at', { ascending: false });
    setHistory((data ?? []) as InvoiceHoldRecord[]);
    setLoading(false);
  }, [invoiceId]);

  useEffect(() => { load(); }, [load]);

  const placeOnHold = useCallback(async (reason: string, notes?: string) => {
    if (!invoiceId) return { error: 'No invoice' };
    const { error } = await supabase.rpc('place_invoice_on_hold_notified', { p_invoice_id: invoiceId, p_reason: reason, p_notes: notes ?? null });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [invoiceId, load]);

  const releaseHold = useCallback(async (holdId: string, notes?: string) => {
    const { error } = await supabase.rpc('release_invoice_hold_notified', { p_hold_id: holdId, p_notes: notes ?? null });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  return { history, loading, reload: load, placeOnHold, releaseHold };
}

export function useInvoicePosting() {
  const [posting, setPosting] = useState(false);

  const postInvoice = useCallback(async (invoiceId: string) => {
    setPosting(true);
    const { data, error } = await supabase.rpc('post_sales_invoice_notified', { p_invoice_id: invoiceId });
    setPosting(false);
    if (error) return { error: error.message };
    return { data };
  }, []);

  const retryPosting = useCallback(async (invoiceId: string) => {
    setPosting(true);
    const { data, error } = await supabase.rpc('retry_failed_invoice_posting', { p_invoice_id: invoiceId });
    setPosting(false);
    if (error) return { error: error.message };
    return { data };
  }, []);

  return { posting, postInvoice, retryPosting };
}

export interface InvoicePostingHistoryRow {
  id: string; attempt_number: number; status: string; error_message: string | null; final_invoice_number: string | null; attempted_at: string; online: boolean;
}

export function useInvoicePostingHistory(invoiceId: string | undefined) {
  const [history, setHistory] = useState<InvoicePostingHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!invoiceId) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase.from('sales_invoice_posting_history').select('*').eq('invoice_id', invoiceId).order('attempted_at', { ascending: false });
      setHistory((data ?? []) as InvoicePostingHistoryRow[]);
      setLoading(false);
    })();
  }, [invoiceId]);

  return { history, loading };
}
