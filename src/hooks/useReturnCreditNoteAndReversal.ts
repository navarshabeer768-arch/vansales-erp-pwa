import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface ReturnCreditNote {
  id: string; credit_note_number: string; approved_credit_amount: number; status: string; reason: string | null; created_at: string;
}

export function useReturnCreditNote(returnId: string | undefined) {
  const [creditNote, setCreditNote] = useState<ReturnCreditNote | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!returnId) return;
    setLoading(true);
    const { data } = await supabase.from('sales_return_credit_notes').select('*').eq('return_id', returnId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    setCreditNote(data as ReturnCreditNote | null);
    setLoading(false);
  }, [returnId]);

  useEffect(() => { load(); }, [load]);

  const generate = useCallback(async (reason?: string) => {
    if (!returnId) return { error: 'No return' };
    const { error } = await supabase.rpc('generate_return_credit_note_notified', { p_return_id: returnId, p_reason: reason ?? null });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [returnId, load]);

  return { creditNote, loading, reload: load, generate };
}

export interface ReturnReversalRequest {
  id: string; reason: string; approval_status: string; request_date: string; decision_reason: string | null;
}

export function useReturnReversal(returnId: string | undefined) {
  const [request, setRequest] = useState<ReturnReversalRequest | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!returnId) return;
    setLoading(true);
    const { data } = await supabase.from('sales_return_reversal_requests').select('*').eq('return_id', returnId).order('request_date', { ascending: false }).limit(1).maybeSingle();
    setRequest(data as ReturnReversalRequest | null);
    setLoading(false);
  }, [returnId]);

  useEffect(() => { load(); }, [load]);

  const createReversalRequest = useCallback(async (reason: string) => {
    if (!returnId) return { error: 'No return' };
    const { error } = await supabase.rpc('create_return_reversal_request_notified', { p_return_id: returnId, p_reason: reason });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [returnId, load]);

  return { request, loading, reload: load, createReversalRequest };
}
