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
  subscription_plan: 'trial' | 'basic' | 'professional' | 'enterprise';
  subscription_status: 'active' | 'suspended' | 'cancelled' | 'trial';
  created_at: string;
}

export interface CompanyBranch {
  id: string;
  code: string;
  name: string;
  address: string | null;
  is_active: boolean;
}

export interface CompanyStaffMember {
  id: string;
  full_name: string;
  email: string;
  is_active: boolean;
  role?: { name: string } | null;
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

export function useCompanyDetail(companyId: string | null) {
  const [company, setCompany] = useState<CompanyRow | null>(null);
  const [branches, setBranches] = useState<CompanyBranch[]>([]);
  const [staff, setStaff] = useState<CompanyStaffMember[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!companyId) { setLoading(false); return; }
    setLoading(true);
    const [{ data: companyRow }, { data: branchRows }, { data: staffRows }] = await Promise.all([
      supabase.from('companies').select('*').eq('id', companyId).single(),
      supabase.from('warehouses').select('id, code, name, address, is_active').eq('company_id', companyId).order('name'),
      supabase.from('app_users').select('id, full_name, email, is_active, role:roles(name)').eq('company_id', companyId).order('full_name'),
    ]);
    setCompany((companyRow ?? null) as CompanyRow | null);
    setBranches((branchRows ?? []) as CompanyBranch[]);
    setStaff((staffRows ?? []) as unknown as CompanyStaffMember[]);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const changePlan = useCallback(async (plan: CompanyRow['subscription_plan']) => {
    if (!companyId) return { error: 'No company' };
    const { error } = await supabase.rpc('update_company_plan', { p_company_id: companyId, p_plan: plan });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [companyId, load]);

  return { company, branches, staff, loading, reload: load, changePlan };
}
