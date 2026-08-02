import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface PaymentPromise {
  id: string;
  customer_id: string;
  promised_amount: number;
  promise_date: string;
  payment_method_expected: string | null;
  customer_notes: string | null;
  employee_notes: string | null;
  reminder_date: string | null;
  status: string;
  created_at: string;
  customer?: { customer_code: string; business_name: string } | null;
}

export function usePaymentPromises() {
  const { company } = useAuth();
  const [promises, setPromises] = useState<PaymentPromise[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data } = await supabase
      .from('payment_promises')
      .select('*, customer:customers(customer_code, business_name)')
      .eq('company_id', company.id)
      .in('status', ['open'])
      .order('promise_date');
    setPromises((data ?? []) as unknown as PaymentPromise[]);
    setLoading(false);
  }, [company]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = useCallback(async (promiseId: string, status: 'kept' | 'broken' | 'cancelled') => {
    const { error } = await supabase.from('payment_promises').update({ status }).eq('id', promiseId);
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  return { promises, loading, reload: load, updateStatus };
}
