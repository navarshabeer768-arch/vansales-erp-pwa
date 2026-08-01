import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface OrderCustomerContext {
  id: string;
  customer_code: string;
  business_name: string;
  status: string;
  customer_type_id: string | null;
  price_list_id: string | null;
  payment_term_id: string | null;
  route_id: string | null;
  van_id: string | null;
  assigned_employee_id: string | null;
  notes: string | null;
  credit_type: string | null;
  available_credit: number | null;
  outstanding_balance: number | null;
  default_address: { id: string; street: string | null; building: string | null; area: string | null } | null;
  default_contact: { id: string; contact_name: string; phone: string | null } | null;
}

// Read-only auto-load for the order header — no credit validation/blocking
// here, that's explicitly Part 2. customer_available_credit() is the
// existing calc function (4A.2 Part 1), reused rather than reimplemented.
export function useOrderCustomerContext(customerId: string | undefined) {
  const [context, setContext] = useState<OrderCustomerContext | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!customerId) { setContext(null); return; }
    setLoading(true);

    const [{ data: customer }, { data: creditProfile }, { data: availableCredit }, { data: address }, { data: contact }] = await Promise.all([
      supabase.from('customers').select('id, customer_code, business_name, status, customer_type_id, route_id, van_id, assigned_employee_id, notes, outstanding_balance')
        .eq('id', customerId).single(),
      supabase.from('customer_credit_profiles').select('credit_type').eq('customer_id', customerId).maybeSingle(),
      supabase.rpc('customer_available_credit', { p_customer_id: customerId }),
      supabase.from('customer_addresses').select('id, street, building, area').eq('customer_id', customerId).eq('is_default_delivery', true).eq('is_current', true).maybeSingle(),
      supabase.from('customer_contacts').select('id, contact_name, phone').eq('customer_id', customerId).eq('is_primary', true).maybeSingle(),
    ]);

    const { data: priceListLink } = await supabase.from('customer_price_lists').select('price_list_id')
      .eq('customer_id', customerId).order('priority').limit(1).maybeSingle();

    if (customer) {
      setContext({
        ...(customer as any),
        price_list_id: priceListLink?.price_list_id ?? null,
        payment_term_id: null, // no default-payment-term-per-customer field exists yet; left for the order form to choose
        credit_type: (creditProfile as any)?.credit_type ?? null,
        available_credit: (availableCredit as number | null) ?? null,
        default_address: address as any,
        default_contact: contact as any,
      });
    } else {
      setContext(null);
    }
    setLoading(false);
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  return { context, loading, reload: load };
}
