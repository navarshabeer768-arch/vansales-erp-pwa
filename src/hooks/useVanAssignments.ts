import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export type VanRoleType = 'driver' | 'salesman' | 'helper' | 'collector';
export type AssignmentType = 'permanent' | 'temporary' | 'replacement';

export interface VanAssignment {
  id: string;
  van_id: string;
  user_id: string;
  role_type: VanRoleType;
  assignment_type: AssignmentType;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  user?: { id: string; full_name: string; username: string } | null;
}

export function useVanAssignments(vanId: string | null) {
  const [assignments, setAssignments] = useState<VanAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!vanId) { setAssignments([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from('van_assignments')
      .select('*, user:app_users(id,full_name,username)')
      .eq('van_id', vanId)
      .order('created_at', { ascending: false });
    setAssignments((data ?? []) as unknown as VanAssignment[]);
    setLoading(false);
  }, [vanId]);

  useEffect(() => { load(); }, [load]);

  const assignUser = useCallback(async (params: {
    userId: string; roleType: VanRoleType; assignmentType: AssignmentType;
    startDate?: string; endDate?: string; notes?: string;
  }) => {
    if (!vanId) return { error: 'No van selected' };
    const { error } = await supabase.rpc('assign_van_user', {
      p_van_id: vanId, p_user_id: params.userId, p_role_type: params.roleType,
      p_assignment_type: params.assignmentType, p_start_date: params.startDate ?? new Date().toISOString().slice(0, 10),
      p_end_date: params.endDate ?? null, p_notes: params.notes ?? null,
    });
    if (error) return { error: error.message };
    await load();
    return { error: null };
  }, [vanId, load]);

  const endAssignment = useCallback(async (assignmentId: string) => {
    const { error } = await supabase.rpc('end_van_assignment', { p_assignment_id: assignmentId });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  return { assignments, loading, reload: load, assignUser, endAssignment };
}

export function useAssignableStaff() {
  const { company } = useAuth();
  const [staff, setStaff] = useState<{ id: string; full_name: string; role_code: string }[]>([]);

  useEffect(() => {
    if (!company) return;
    (async () => {
      const { data } = await supabase
        .from('app_users')
        .select('id, full_name, role:roles(code)')
        .eq('company_id', company.id)
        .eq('is_active', true);
      setStaff((data ?? []).map((u: any) => ({ id: u.id, full_name: u.full_name, role_code: u.role?.code })));
    })();
  }, [company]);

  return staff;
}

/**
 * Which vans the signed-in user is allowed to operate (sell from, load,
 * etc). Anyone with van_loading:approve (managers/admins) sees every van —
 * "only assigned users can access the van" is meant to keep salesmen/
 * drivers/helpers/collectors scoped to their own van, not to lock out the
 * people who need oversight of the whole fleet.
 */
export function useMyVanIds() {
  const { company, user, can } = useAuth();
  const [vanIds, setVanIds] = useState<Set<string> | null>(null); // null = "no restriction, show all"

  useEffect(() => {
    if (!company || !user) return;
    if (can('van_loading:approve')) { setVanIds(null); return; }
    (async () => {
      const { data } = await supabase
        .from('van_assignments')
        .select('van_id')
        .eq('company_id', company.id)
        .eq('user_id', user.id)
        .eq('is_active', true);
      setVanIds(new Set((data ?? []).map((r) => r.van_id)));
    })();
  }, [company, user, can]);

  return vanIds; // null = unrestricted; Set = restrict to these van IDs
}
