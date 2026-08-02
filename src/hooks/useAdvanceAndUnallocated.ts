import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface CustomerAdvanceBalance {
  id: string;
  customer_id: string;
  receipt_id: string;
  original_amount: number;
  available_amount: number;
  allocated_amount: number;
  status: string;
  receipt_date: string;
  customer?: { customer_code: string; business_name: string } | null;
  receipt?: { receipt_number: string; final_receipt_number: string | null } | null;
}

export interface CustomerUnallocatedCredit {
  id: string;
  customer_id: string;
  receipt_id: string;
  original_amount: number;
  available_amount: number;
  allocated_amount: number;
  reason: string | null;
  status: string;
  customer?: { customer_code: string; business_name: string } | null;
  receipt?: { receipt_number: string; final_receipt_number: string | null } | null;
}

export function useAdvanceAndUnallocatedBalances() {
  const { company } = useAuth();
  const [advances, setAdvances] = useState<CustomerAdvanceBalance[]>([]);
  const [unallocated, setUnallocated] = useState<CustomerUnallocatedCredit[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const [{ data: advanceData }, { data: unallocatedData }] = await Promise.all([
      supabase.from('customer_advance_balances')
        .select('*, customer:customers(customer_code, business_name), receipt:receipt_vouchers(receipt_number, final_receipt_number)')
        .eq('company_id', company.id).in('status', ['available', 'partially_allocated']),
      supabase.from('customer_unallocated_credits')
        .select('*, customer:customers(customer_code, business_name), receipt:receipt_vouchers(receipt_number, final_receipt_number)')
        .eq('company_id', company.id).in('status', ['available', 'partially_allocated']),
    ]);
    setAdvances((advanceData ?? []) as unknown as CustomerAdvanceBalance[]);
    setUnallocated((unallocatedData ?? []) as unknown as CustomerUnallocatedCredit[]);
    setLoading(false);
  }, [company]);

  useEffect(() => { load(); }, [load]);

  const allocateAdvance = useCallback(async (advanceId: string, invoiceId: string, amount: number, reference?: string) => {
    const { error } = await supabase.rpc('allocate_customer_advance', { p_advance_id: advanceId, p_invoice_id: invoiceId, p_amount: amount, p_reference: reference ?? null });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  const allocateUnallocated = useCallback(async (unallocatedId: string, invoiceId: string, amount: number) => {
    const { error } = await supabase.rpc('allocate_unallocated_credit', { p_unallocated_id: unallocatedId, p_invoice_id: invoiceId, p_amount: amount });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  return { advances, unallocated, loading, reload: load, allocateAdvance, allocateUnallocated };
}
