import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface CreditDashboardStats {
  cashCustomers: number;
  creditCustomers: number;
  hybridCustomers: number;
  blockedCustomers: number;
  nearLimitCustomers: number;
  overLimitCustomers: number;
  temporaryCreditActive: number;
  approvalsPending: number;
  riskDistribution: { label: string; count: number }[];
}

export function useCreditDashboard() {
  const { company } = useAuth();
  const [stats, setStats] = useState<CreditDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data: profiles } = await supabase
      .from('customer_credit_profiles')
      .select('credit_type, credit_status, temporary_credit_limit, temporary_credit_expiry, risk_level:customer_risk_levels(label)')
      .eq('company_id', company.id);

    const { count: approvalsPending } = await supabase
      .from('customer_credit_approvals')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', company.id).eq('status', 'pending');

    const rows = (profiles ?? []) as any[];
    const riskCounts = new Map<string, number>();
    for (const r of rows) {
      const label = r.risk_level?.label ?? 'Unrated';
      riskCounts.set(label, (riskCounts.get(label) ?? 0) + 1);
    }

    setStats({
      cashCustomers: rows.filter((r) => r.credit_type === 'cash').length,
      creditCustomers: rows.filter((r) => r.credit_type === 'credit').length,
      hybridCustomers: rows.filter((r) => r.credit_type === 'hybrid').length,
      blockedCustomers: rows.filter((r) => r.credit_status === 'blocked' || r.credit_status === 'suspended').length,
      nearLimitCustomers: rows.filter((r) => r.credit_status === 'near_limit').length,
      overLimitCustomers: rows.filter((r) => r.credit_status === 'over_limit').length,
      temporaryCreditActive: rows.filter((r) => r.temporary_credit_limit != null && r.temporary_credit_expiry >= new Date().toISOString().slice(0, 10)).length,
      approvalsPending: approvalsPending ?? 0,
      riskDistribution: Array.from(riskCounts.entries()).map(([label, count]) => ({ label, count })),
    });
    setLoading(false);
  }, [company]);

  useEffect(() => { load(); }, [load]);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    await supabase.rpc('refresh_all_customer_credit_statuses');
    await load();
    setRefreshing(false);
  }, [load]);

  return { stats, loading, refreshing, refreshAll };
}
