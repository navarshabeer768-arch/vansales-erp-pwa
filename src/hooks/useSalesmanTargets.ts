import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface SalesmanTarget {
  id: string;
  user_id: string;
  target_month: string;
  sales_target: number;
  collection_target: number;
  commission_rate: number;
  notes: string | null;
}

function monthStart(date = new Date()): string {
  return new Date(date.getFullYear(), date.getMonth(), 1).toISOString().slice(0, 10);
}

export function useSalesmen() {
  const { company } = useAuth();
  const [salesmen, setSalesmen] = useState<{ id: string; full_name: string; username: string; is_active: boolean }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!company) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('app_users')
        .select('id, full_name, username, is_active, role:roles!inner(code)')
        .eq('company_id', company.id)
        .in('role.code', ['salesman', 'van_sales_manager']);
      setSalesmen((data ?? []) as any);
      setLoading(false);
    })();
  }, [company]);

  return { salesmen, loading };
}

export function useSalesmanTargets(month: string = monthStart()) {
  const { company } = useAuth();
  const [targets, setTargets] = useState<SalesmanTarget[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data } = await supabase.from('salesman_targets').select('*').eq('company_id', company.id).eq('target_month', month);
    setTargets((data ?? []) as SalesmanTarget[]);
    setLoading(false);
  }, [company, month]);

  useEffect(() => { load(); }, [load]);

  const setTarget = useCallback(async (params: {
    userId: string; salesTarget: number; collectionTarget: number; commissionRate: number; notes?: string;
  }) => {
    if (!company) return { error: 'No company context' };
    const { error } = await supabase.from('salesman_targets').upsert({
      company_id: company.id, user_id: params.userId, target_month: month,
      sales_target: params.salesTarget, collection_target: params.collectionTarget,
      commission_rate: params.commissionRate, notes: params.notes || null,
    }, { onConflict: 'user_id,target_month' });
    if (error) return { error: error.message };
    await load();
    return { error: null };
  }, [company, month, load]);

  return { targets, loading, reload: load, setTarget };
}
