import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface RouteCollectionCustomer {
  plan_item_id: string;
  customer_id: string;
  sequence: number;
  visit_status: string;
  customer_code: string;
  business_name: string;
  outstanding_balance: number | null;
  primary_phone: string | null;
  last_receipt_date: string | null;
}

export function useTodayRouteCollection() {
  const { user, company } = useAuth();
  const [planId, setPlanId] = useState<string | null>(null);
  const [routeName, setRouteName] = useState<string | null>(null);
  const [customers, setCustomers] = useState<RouteCollectionCustomer[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user || !company) return;
    setLoading(true);
    const today = new Date().toISOString().slice(0, 10);

    const { data: plan } = await supabase
      .from('daily_visit_plans')
      .select('id, route:routes(name)')
      .eq('company_id', company.id)
      .eq('primary_employee_id', user.id)
      .eq('plan_date', today)
      .in('status', ['approved', 'ready', 'started', 'paused'])
      .maybeSingle();

    if (!plan) { setPlanId(null); setCustomers([]); setLoading(false); return; }
    setPlanId(plan.id);
    setRouteName((plan as any).route?.name ?? null);

    const { data: items } = await supabase
      .from('daily_visit_plan_items')
      .select('id, customer_id, sequence, visit_status, customer:customers(customer_code, business_name, outstanding_balance, primary_phone)')
      .eq('plan_id', plan.id)
      .neq('visit_status', 'not_applicable')
      .order('sequence');

    const customerIds = (items ?? []).map((i: any) => i.customer_id);
    const { data: lastReceipts } = customerIds.length
      ? await supabase.from('receipt_vouchers').select('customer_id, receipt_date').eq('company_id', company.id).in('customer_id', customerIds).order('receipt_date', { ascending: false })
      : { data: [] as any[] };
    const lastReceiptMap = new Map<string, string>();
    (lastReceipts ?? []).forEach((r: any) => { if (!lastReceiptMap.has(r.customer_id)) lastReceiptMap.set(r.customer_id, r.receipt_date); });

    setCustomers(((items ?? []) as any[]).map((i) => ({
      plan_item_id: i.id, customer_id: i.customer_id, sequence: i.sequence, visit_status: i.visit_status,
      customer_code: i.customer?.customer_code ?? '', business_name: i.customer?.business_name ?? '',
      outstanding_balance: i.customer?.outstanding_balance ?? null, primary_phone: i.customer?.primary_phone ?? null,
      last_receipt_date: lastReceiptMap.get(i.customer_id) ?? null,
    })));
    setLoading(false);
  }, [user, company]);

  useEffect(() => { load(); }, [load]);

  return { planId, routeName, customers, loading, reload: load };
}
