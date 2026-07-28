import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { createEphemeralAuthClient } from '@/lib/ephemeralAuthClient';
import { generateSyntheticEmail } from '@/lib/syntheticEmail';

export interface CompanyRow {
  id: string;
  name: string;
  slug: string;
  store_id: string;
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

export async function checkStoreIdAvailable(storeId: string): Promise<boolean> {
  if (!storeId.trim()) return true; // empty = auto-generate, always "available"
  const { data } = await supabase.rpc('is_store_id_available', { p_store_id: storeId.trim() });
  return data === true;
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

  const createCompany = useCallback(async (params: {
    companyName: string; companyPhone?: string; companyAddress?: string; currency?: string; taxNumber?: string;
    adminFullName: string; adminUsername: string; adminPhone?: string; tempPassword: string; storeId?: string;
  }) => {
    try {
      const syntheticEmail = generateSyntheticEmail(params.adminUsername);

      // Ephemeral client: signing up here must never touch the platform admin's
      // own session (the main `supabase` client, which persists sessions).
      const ephemeral = createEphemeralAuthClient();
      const { data: signUpData, error: signUpError } = await ephemeral.auth.signUp({
        email: syntheticEmail, password: params.tempPassword,
      });
      if (signUpError) {
        return { error: signUpError.message };
      }
      if (!signUpData.user) {
        return { error: 'Failed to create the login for this company.' };
      }

      const slug = `${params.companyName.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${Date.now().toString(36)}`;

      const { data: companyId, error: bootstrapError } = await supabase.rpc('bootstrap_company', {
        p_company_name: params.companyName,
        p_slug: slug,
        p_admin_user_id: signUpData.user.id,
        p_admin_full_name: params.adminFullName,
        p_admin_email: syntheticEmail,
        p_admin_username: params.adminUsername,
        p_company_phone: params.companyPhone ?? null,
        p_company_address: params.companyAddress ?? null,
        p_currency: params.currency ?? 'QAR',
        p_tax_number: params.taxNumber ?? null,
        p_admin_phone: params.adminPhone ?? null,
        p_store_id: params.storeId ?? null,
      });
      if (bootstrapError || !companyId) {
        if (bootstrapError?.code === '23505') {
          return { error: `Username "${params.adminUsername}" is already taken. Choose a different one.` };
        }
        return { error: bootstrapError?.message ?? 'Failed to create the company.' };
      }

      // Platform admins can approve their own creations immediately — no need
      // for the pending-approval step self-service signups go through.
      const { error: approveError } = await supabase.rpc('approve_company', { p_company_id: companyId });
      if (approveError) return { error: approveError.message };

      const { data: createdCompany } = await supabase.from('companies').select('store_id').eq('id', companyId).single();

      await load();
      return { error: null, storeId: createdCompany?.store_id as string | undefined };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Something went wrong creating the company.' };
    }
  }, [load]);

  return { companies, loading, reload: load, approve, suspend, createCompany };
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
