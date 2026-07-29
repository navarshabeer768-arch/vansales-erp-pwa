import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface SupplierWithPayable {
  id: string;
  name: string;
  phone: string | null;
  outstanding_payable: number;
}

export interface SupplierPayment {
  id: string;
  supplier_id: string;
  amount: number;
  method: 'cash' | 'bank' | 'cheque';
  reference_no: string | null;
  created_at: string;
  supplier?: { id: string; name: string } | null;
}

export function useSuppliersWithPayable() {
  const { company } = useAuth();
  const [suppliers, setSuppliers] = useState<SupplierWithPayable[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data } = await supabase
      .from('suppliers')
      .select('id, name, phone, outstanding_payable')
      .eq('company_id', company.id)
      .gt('outstanding_payable', 0)
      .order('outstanding_payable', { ascending: false });
    setSuppliers((data ?? []) as SupplierWithPayable[]);
    setLoading(false);
  }, [company]);

  useEffect(() => { load(); }, [load]);

  return { suppliers, loading, reload: load };
}

export function useSupplierPayments() {
  const { company } = useAuth();
  const [payments, setPayments] = useState<SupplierPayment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data } = await supabase
      .from('supplier_payments')
      .select('*, supplier:suppliers(id,name)')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false })
      .limit(200);
    setPayments((data ?? []) as unknown as SupplierPayment[]);
    setLoading(false);
  }, [company]);

  useEffect(() => { load(); }, [load]);

  const recordPayment = useCallback(async (params: {
    supplierId: string; amount: number; method: SupplierPayment['method']; referenceNo?: string;
  }) => {
    if (params.amount <= 0) return { error: 'Amount must be greater than zero' };
    const { error } = await supabase.rpc('pay_supplier', {
      p_supplier_id: params.supplierId, p_amount: params.amount,
      p_method: params.method, p_reference_no: params.referenceNo || null,
    });
    if (error) return { error: error.message };
    await load();
    return { error: null };
  }, [load]);

  return { payments, loading, reload: load, recordPayment };
}
