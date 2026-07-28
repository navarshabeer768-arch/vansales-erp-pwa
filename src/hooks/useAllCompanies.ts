import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface CompanyRow {
  id: string;
  name: string;
  slug: string;
  phone: string | null;
  address: string | null;
  currency: string;
  tax_number: string | null;
  is_active: boolean;
  subscription_status: 'active' | 'suspended' | 'cancelled' | 'trial';
  created_at: string;
}

export function useAllCompanies() {
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('companies').select('*').order('created_at', { ascending: false });
    setLoading(false);
    setCompanies((data ?? []) as CompanyRow[]);
  }, []);

  useEffect(() => { load(); }, [load]);

  const approve = useCallback(async (companyId: string) => {
    const { error } = await supabase.rpc('approve_company', { p_company_id: companyId });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  const suspend = useCallback(async (companyId: string) => {
    const { error } = await supabase.rpc('suspend_company', { p_company_id: companyId, p_reason: null });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  return { companies, loading, reload: load, approve, suspend };
}
