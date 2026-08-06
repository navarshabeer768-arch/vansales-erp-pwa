import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { AdjustmentDocumentTable } from './useAdjustmentApprovalPosting';

interface ReversalQueueRow {
  id: string;
  document_table: AdjustmentDocumentTable;
  document_id: string;
  reason: string;
  request_date: string;
}

export const ADJUSTMENT_DOCUMENT_LABELS: Record<AdjustmentDocumentTable, string> = {
  credit_notes: 'Credit Note', debit_notes: 'Debit Note', customer_adjustments: 'Customer Adjustment',
};
export const ADJUSTMENT_DOCUMENT_ROUTES: Record<AdjustmentDocumentTable, string> = {
  credit_notes: '/accounting/credit-notes', debit_notes: '/accounting/debit-notes', customer_adjustments: '/accounting/customer-adjustments',
};

export function useAdjustmentReversalQueue() {
  const { company } = useAuth();
  const [requests, setRequests] = useState<ReversalQueueRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data } = await supabase
      .from('customer_adjustment_reversals')
      .select('*')
      .eq('company_id', company.id)
      .eq('approval_status', 'pending')
      .order('request_date');
    setRequests((data ?? []) as unknown as ReversalQueueRow[]);
    setLoading(false);
  }, [company]);

  useEffect(() => { load(); }, [load]);

  const decide = useCallback(async (requestId: string, approve: boolean, reason?: string) => {
    const { data, error } = await supabase.rpc('execute_adjustment_reversal', { p_reversal_id: requestId, p_approve: approve, p_decision_reason: reason ?? null });
    if (error) return { error: error.message };
    await load();
    return { data };
  }, [load]);

  return { requests, loading, decide };
}

export interface CreditNoteUnallocatedCredit {
  id: string;
  customer_id: string;
  credit_note_id: string;
  original_amount: number;
  available_amount: number;
  status: string;
  reason: string | null;
  customer?: { customer_code: string; business_name: string } | null;
  credit_note?: { document_number: string } | null;
}

export function useCreditNoteUnallocatedCredits() {
  const { company } = useAuth();
  const [credits, setCredits] = useState<CreditNoteUnallocatedCredit[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data } = await supabase
      .from('customer_unallocated_credits')
      .select('*, customer:customers(customer_code, business_name), credit_note:credit_notes(document_number)')
      .eq('company_id', company.id)
      .not('credit_note_id', 'is', null)
      .in('status', ['available', 'partially_allocated']);
    setCredits((data ?? []) as unknown as CreditNoteUnallocatedCredit[]);
    setLoading(false);
  }, [company]);

  useEffect(() => { load(); }, [load]);

  const allocate = useCallback(async (unallocatedId: string, invoiceId: string, amount: number) => {
    const { error } = await supabase.rpc('allocate_credit_note_unallocated_credit', { p_unallocated_id: unallocatedId, p_invoice_id: invoiceId, p_amount: amount });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  return { credits, loading, reload: load, allocate };
}
