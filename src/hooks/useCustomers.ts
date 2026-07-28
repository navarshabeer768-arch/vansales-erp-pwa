import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface Customer {
  id: string;
  company_id: string;
  customer_code: string;
  business_name: string;
  customer_type: 'retail' | 'wholesale' | 'supermarket' | 'hypermarket' | 'restaurant' | 'hotel' | 'pharmacy';
  credit_limit: number;
  outstanding_balance: number;
  price_level: 'retail' | 'wholesale' | 'selling' | 'offer';
  address: string | null;
  is_active: boolean;
  created_at: string;
}

export type CustomerInput = Omit<Customer, 'id' | 'company_id' | 'outstanding_balance' | 'created_at'>;

function genCustomerCode() {
  return `CUST-${Date.now().toString(36).toUpperCase()}`;
}

export function useCustomers() {
  const { company } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data } = await supabase
      .from('customers')
      .select('*')
      .eq('company_id', company.id)
      .order('business_name', { ascending: true });
    setLoading(false);
    setCustomers((data ?? []) as Customer[]);
  }, [company]);

  useEffect(() => { load(); }, [load]);

  const createCustomer = useCallback(async (input: Partial<CustomerInput> & { business_name: string }) => {
    if (!company) return { error: 'No company context', data: null };
    const { data, error } = await supabase
      .from('customers')
      .insert({
        company_id: company.id,
        customer_code: input.customer_code || genCustomerCode(),
        business_name: input.business_name,
        customer_type: input.customer_type ?? 'retail',
        credit_limit: input.credit_limit ?? 0,
        price_level: input.price_level ?? 'retail',
        address: input.address ?? null,
        is_active: true,
      })
      .select('*')
      .single();
    if (!error) await load();
    return { error: error?.message ?? null, data };
  }, [company, load]);

  return { customers, loading, reload: load, createCustomer };
}
