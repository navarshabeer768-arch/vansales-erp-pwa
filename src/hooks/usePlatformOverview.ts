import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface PlatformStats {
  total_companies: number;
  active_companies: number;
  pending_companies: number;
  total_branches: number;
  total_staff: number;
  total_products: number;
}

export function usePlatformStats() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.rpc('platform_dashboard_stats');
    setStats((data ?? null) as PlatformStats | null);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return { stats, loading, reload: load };
}

export interface PlatformBranch {
  id: string;
  code: string;
  name: string;
  address: string | null;
  is_active: boolean;
  created_at: string;
  company_id: string;
  company?: { id: string; name: string } | null;
}

export function usePlatformBranches() {
  const [branches, setBranches] = useState<PlatformBranch[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('warehouses')
      .select('*, company:companies(id,name)')
      .order('created_at', { ascending: false });
    setBranches((data ?? []) as unknown as PlatformBranch[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const createBranch = useCallback(async (params: { companyId: string; code: string; name: string; address?: string }) => {
    const { error } = await supabase.rpc('create_branch_for_company', {
      p_company_id: params.companyId, p_code: params.code, p_name: params.name, p_address: params.address ?? null,
    });
    if (error) return { error: error.code === '23505' ? 'This branch code is already used by that company.' : error.message };
    await load();
    return { error: null };
  }, [load]);

  return { branches, loading, reload: load, createBranch };
}

export interface PlatformStaffMember {
  id: string;
  full_name: string;
  email: string;
  is_active: boolean;
  created_at: string;
  company_id: string;
  company?: { id: string; name: string } | null;
  role?: { name: string } | null;
}

export function usePlatformStaff() {
  const [staff, setStaff] = useState<PlatformStaffMember[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('app_users')
      .select('*, company:companies(id,name), role:roles(name)')
      .order('created_at', { ascending: false });
    setStaff((data ?? []) as unknown as PlatformStaffMember[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return { staff, loading, reload: load };
}
