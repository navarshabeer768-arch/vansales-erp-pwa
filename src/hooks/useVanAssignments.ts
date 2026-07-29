import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface VanStaffRole { code: string; label: string; is_system: boolean; }

export function useVanStaffRoles() {
  const { company } = useAuth();
  const [roles, setRoles] = useState<VanStaffRole[]>([]);

  useEffect(() => {
    if (!company) return;
    (async () => {
      const { data } = await supabase
        .from('van_staff_roles')
        .select('code, label, is_system')
        .or(`company_id.is.null,company_id.eq.${company.id}`)
        .order('is_system', { ascending: false });
      setRoles((data ?? []) as VanStaffRole[]);
    })();
  }, [company]);

  const addCustomRole = useCallback(async (code: string, label: string) => {
    if (!company) return { error: 'No company context' };
    const { error } = await supabase.from('van_staff_roles').insert({ code, company_id: company.id, label, is_system: false });
    return { error: error?.message ?? null };
  }, [company]);

  return { roles, addCustomRole };
}

export interface VanStaffAssignment {
  id: string;
  van_id: string;
  employee_id: string;
  role_code: string;
  is_primary: boolean;
  assigned_date: string;
  removed_date: string | null;
  status: 'active' | 'inactive';
  created_at: string;
  employee?: { id: string; full_name: string; username: string } | null;
}

export function useVanStaff(vanId: string | null) {
  const [assignments, setAssignments] = useState<VanStaffAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!vanId) { setAssignments([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from('van_staff_assignments')
      .select('*, employee:app_users(id,full_name,username)')
      .eq('van_id', vanId)
      .order('created_at', { ascending: false });
    setAssignments((data ?? []) as unknown as VanStaffAssignment[]);
    setLoading(false);
  }, [vanId]);

  useEffect(() => { load(); }, [load]);

  /** Assign one employee to this van with one or more roles; one role is marked primary. */
  const assignStaff = useCallback(async (params: {
    employeeId: string; roleCodes: string[]; primaryRoleCode: string; assignedDate?: string;
  }) => {
    if (!vanId) return { error: 'No van selected' };
    if (params.roleCodes.length === 0) return { error: 'Select at least one role.' };
    const { error } = await supabase.rpc('assign_van_staff', {
      p_van_id: vanId, p_employee_id: params.employeeId, p_role_codes: params.roleCodes,
      p_primary_role_code: params.primaryRoleCode, p_assigned_date: params.assignedDate ?? new Date().toISOString().slice(0, 10),
    });
    if (error) return { error: error.message };
    await load();
    return { error: null };
  }, [vanId, load]);

  /** Ends a single role for an employee (they keep any other active roles on this van). */
  const removeRole = useCallback(async (assignmentId: string) => {
    const { error } = await supabase.rpc('remove_van_staff_role', { p_assignment_id: assignmentId });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  /** Fully removes an employee from this van (ends every active role they hold here). */
  const removeEmployee = useCallback(async (employeeId: string) => {
    if (!vanId) return { error: 'No van selected' };
    const { error } = await supabase.rpc('remove_van_staff', { p_van_id: vanId, p_employee_id: employeeId });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [vanId, load]);

  // Group by employee for display: each employee shows once with all their active roles.
  const activeByEmployee = new Map<string, VanStaffAssignment[]>();
  for (const a of assignments.filter((x) => x.status === 'active')) {
    const list = activeByEmployee.get(a.employee_id) ?? [];
    list.push(a);
    activeByEmployee.set(a.employee_id, list);
  }

  return { assignments, activeByEmployee, loading, reload: load, assignStaff, removeRole, removeEmployee };
}

export interface AllStaffAssignmentRow { employee_id: string; van_id: string; van_name: string; role_code: string; is_primary: boolean; }

/** All active van staff assignments across the company — lets a list page show "which van is this employee currently on" without one query per row. */
export function useAllActiveVanStaff() {
  const { company } = useAuth();
  const [rows, setRows] = useState<AllStaffAssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!company) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('van_staff_assignments')
        .select('employee_id, van_id, role_code, is_primary, van:vans(name)')
        .eq('company_id', company.id)
        .eq('status', 'active');
      setRows(((data ?? []) as any[]).map((r) => ({
        employee_id: r.employee_id, van_id: r.van_id, van_name: r.van?.name ?? '—', role_code: r.role_code, is_primary: r.is_primary,
      })));
      setLoading(false);
    })();
  }, [company]);

  return { rows, loading };
}

export interface VanStaffHistoryRow {
  id: string;
  van_id: string;
  van_name: string;
  employee_id: string;
  employee_name: string;
  role_code: string;
  is_primary: boolean;
  assigned_date: string;
  removed_date: string | null;
  status: 'active' | 'inactive';
}

/** Full company-wide assignment history (active + ended) — backs the Van Staff / Employee Assignment / Role Assignment / Assignment History reports. */
export function useVanStaffHistory() {
  const { company } = useAuth();
  const [rows, setRows] = useState<VanStaffHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data } = await supabase
      .from('van_staff_assignments')
      .select('id, van_id, employee_id, role_code, is_primary, assigned_date, removed_date, status, van:vans(name), employee:app_users(full_name)')
      .eq('company_id', company.id)
      .order('assigned_date', { ascending: false });
    setRows(((data ?? []) as any[]).map((r) => ({
      id: r.id, van_id: r.van_id, van_name: r.van?.name ?? '—', employee_id: r.employee_id,
      employee_name: r.employee?.full_name ?? '—', role_code: r.role_code, is_primary: r.is_primary,
      assigned_date: r.assigned_date, removed_date: r.removed_date, status: r.status,
    })));
    setLoading(false);
  }, [company]);

  useEffect(() => { load(); }, [load]);

  return { rows, loading, reload: load };
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
 * drivers/helpers/collectors scoped to their own van(s), not to lock out
 * the people who need oversight of the whole fleet. A person can have
 * roles on more than one van, so this returns a set, not a single id.
 */
export function useMyVanIds() {
  const { company, user, can } = useAuth();
  const [vanIds, setVanIds] = useState<Set<string> | null>(null); // null = "no restriction, show all"

  useEffect(() => {
    if (!company || !user) return;
    if (can('van_loading:approve')) { setVanIds(null); return; }
    (async () => {
      const { data } = await supabase
        .from('van_staff_assignments')
        .select('van_id')
        .eq('company_id', company.id)
        .eq('employee_id', user.id)
        .eq('status', 'active');
      setVanIds(new Set((data ?? []).map((r) => r.van_id)));
    })();
  }, [company, user, can]);

  return vanIds; // null = unrestricted; Set = restrict to these van IDs
}

export interface MyVanContext {
  assignment_id: string;
  van_id: string;
  van_name: string;
  role_code: string;
  is_primary: boolean;
  route_id: string | null;
  route_name: string | null;
}

/** "Auto-detect on login": the signed-in person's own current van/role assignments, used to default pickers instead of asking every time. */
export function useMyVanContext() {
  const { user } = useAuth();
  const [context, setContext] = useState<MyVanContext[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase.rpc('my_van_staff_assignments');
      setContext((data ?? []) as MyVanContext[]);
      setLoading(false);
    })();
  }, [user]);

  /** If the person has exactly one van (regardless of how many roles there), that's an unambiguous default. */
  const defaultVanId = (() => {
    const uniqueVans = new Set(context.map((c) => c.van_id));
    return uniqueVans.size === 1 ? context[0].van_id : null;
  })();

  return { context, loading, defaultVanId };
}
