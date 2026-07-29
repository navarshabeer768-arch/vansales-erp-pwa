import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { createEphemeralAuthClient } from '@/lib/ephemeralAuthClient';
import { generateSyntheticEmail } from '@/lib/syntheticEmail';

export interface StaffMember {
  id: string;
  employee_code: string | null;
  username: string;
  full_name: string;
  phone: string | null;
  role_id: string;
  is_active: boolean;
  created_at: string;
  role?: { id: string; name: string; code: string } | null;
}

export interface CompanyRoleOption { id: string; name: string; code: string; }

export function useCompanyRoles() {
  const { company } = useAuth();
  const [roles, setRoles] = useState<CompanyRoleOption[]>([]);

  useEffect(() => {
    if (!company) return;
    (async () => {
      const { data } = await supabase
        .from('roles')
        .select('id, name, code')
        .eq('company_id', company.id)
        .order('name');
      setRoles((data ?? []) as CompanyRoleOption[]);
    })();
  }, [company]);

  return roles;
}

export function useStaff() {
  const { company } = useAuth();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data } = await supabase
      .from('app_users')
      .select('id, employee_code, username, full_name, phone, role_id, is_active, created_at, role:roles(id,name,code)')
      .eq('company_id', company.id)
      .order('full_name');
    setStaff((data ?? []) as unknown as StaffMember[]);
    setLoading(false);
  }, [company]);

  useEffect(() => { load(); }, [load]);

  const createStaff = useCallback(async (params: {
    fullName: string; username: string; phone?: string; roleId: string; employeeCode?: string; tempPassword: string;
  }) => {
    if (!company) return { error: 'No company context' };

    // Check username availability within this company before creating an
    // auth account we'd otherwise have to abandon.
    const { data: existing } = await supabase
      .from('app_users')
      .select('id')
      .eq('company_id', company.id)
      .ilike('username', params.username)
      .maybeSingle();
    if (existing) return { error: `Username "${params.username}" is already taken in this company.` };

    const syntheticEmail = generateSyntheticEmail(params.username);

    // Ephemeral client: this signUp must never replace the current admin's
    // own session (the main `supabase` client persists sessions).
    const ephemeral = createEphemeralAuthClient();
    const { data: signUpData, error: signUpError } = await ephemeral.auth.signUp({
      email: syntheticEmail, password: params.tempPassword,
    });
    if (signUpError) return { error: signUpError.message };
    if (!signUpData.user) return { error: 'Failed to create the login for this staff member.' };

    const { error: insertError } = await supabase.from('app_users').insert({
      id: signUpData.user.id, company_id: company.id, role_id: params.roleId,
      full_name: params.fullName, email: syntheticEmail, phone: params.phone || null,
      username: params.username, employee_code: params.employeeCode || null,
    });
    if (insertError) {
      return { error: insertError.code === '23505' ? 'That username or employee code is already taken.' : insertError.message };
    }

    await load();
    return { error: null };
  }, [company, load]);

  const updateStaffRole = useCallback(async (staffId: string, roleId: string) => {
    const { error } = await supabase.from('app_users').update({ role_id: roleId }).eq('id', staffId);
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  const setStaffActive = useCallback(async (staffId: string, isActive: boolean) => {
    const { error } = await supabase.from('app_users').update({ is_active: isActive }).eq('id', staffId);
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  return { staff, loading, reload: load, createStaff, updateStaffRole, setStaffActive };
}
