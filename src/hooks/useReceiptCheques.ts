import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface ChequeComponent {
  payment_component_id: string;
  amount: number;
  cheque_number: string;
  cheque_date: string;
  bank_name: string;
  is_post_dated: boolean;
  cheque_status: string;
  verification_notes: string | null;
}

export function useReceiptCheques(receiptId: string | undefined) {
  const [cheques, setCheques] = useState<ChequeComponent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!receiptId) return;
    setLoading(true);
    const { data } = await supabase
      .from('receipt_payment_components')
      .select('id, amount, cheque_receipt_details(cheque_number, cheque_date, bank_name, is_post_dated, cheque_status, verification_notes)')
      .eq('receipt_id', receiptId).eq('payment_method_code', 'cheque');
    setCheques(((data ?? []) as any[]).filter((r) => r.cheque_receipt_details).map((r) => ({
      payment_component_id: r.id, amount: r.amount,
      cheque_number: r.cheque_receipt_details.cheque_number, cheque_date: r.cheque_receipt_details.cheque_date,
      bank_name: r.cheque_receipt_details.bank_name, is_post_dated: r.cheque_receipt_details.is_post_dated,
      cheque_status: r.cheque_receipt_details.cheque_status, verification_notes: r.cheque_receipt_details.verification_notes,
    })));
    setLoading(false);
  }, [receiptId]);

  useEffect(() => { load(); }, [load]);

  const verify = useCallback(async (paymentComponentId: string, approve: boolean, notes?: string) => {
    const { error } = await supabase.rpc('verify_cheque', { p_payment_component_id: paymentComponentId, p_approve: approve, p_notes: notes ?? null });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  const clear = useCallback(async (paymentComponentId: string, bankReference?: string, notes?: string) => {
    const { error } = await supabase.rpc('clear_cheque', { p_payment_component_id: paymentComponentId, p_bank_reference: bankReference ?? null, p_notes: notes ?? null });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  const returnCheque = useCallback(async (paymentComponentId: string, reason: string, bankCharges?: number, notes?: string) => {
    const { error } = await supabase.rpc('return_cheque_notified', { p_payment_component_id: paymentComponentId, p_return_reason: reason, p_bank_charges: bankCharges ?? 0, p_notes: notes ?? null });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  return { cheques, loading, reload: load, verify, clear, returnCheque };
}
