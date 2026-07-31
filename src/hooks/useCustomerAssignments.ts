import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export type CustomerRoleCode = 'driver' | 'salesman' | 'collector' | 'helper' | 'supervisor' | 'manager' | 'stock_keeper' | 'custom';

export interface CustomerAssignment {
  id: string;
  customer_id: string;
  employee_id: string;
  role_code: CustomerRoleCode;
  is_primary: boolean;
  assigned_date: string;
  removed_date: string | null;
  status: 'active' | 'inactive';
  created_at: string;
  employee?: { id: string; full_name: string } | null;
}

export function useCustomerAssignments(customerId: string | null) {
  const { company } = useAuth();
  const [assignments, setAssignments] = useState<CustomerAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company || !customerId) { setAssignments([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from('customer_assignments')
      .select('*, employee:app_users(id,full_name)')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });
    setAssignments((data ?? []) as unknown as CustomerAssignment[]);
    setLoading(false);
  }, [company, customerId]);

  useEffect(() => { load(); }, [load]);

  const assignEmployee = useCallback(async (employeeId: string, roleCode: CustomerRoleCode, isPrimary = false) => {
    if (!customerId) return { error: 'No customer selected' };
    const { error } = await supabase.rpc('assign_customer_employee', {
      p_customer_id: customerId, p_employee_id: employeeId, p_role_code: roleCode, p_is_primary: isPrimary,
    });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [customerId, load]);

  const removeAssignment = useCallback(async (assignmentId: string) => {
    const { error } = await supabase.rpc('remove_customer_employee', { p_assignment_id: assignmentId });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  const activeByEmployee = new Map<string, CustomerAssignment[]>();
  for (const a of assignments.filter((x) => x.status === 'active')) {
    const list = activeByEmployee.get(a.employee_id) ?? [];
    list.push(a);
    activeByEmployee.set(a.employee_id, list);
  }

  return { assignments, activeByEmployee, loading, reload: load, assignEmployee, removeAssignment };
}

export interface ReassignmentEntry {
  id: string; field_name: string; old_value: string | null; new_value: string | null; changed_at: string;
  changed_by_user?: { full_name: string } | null;
}

export interface StatusHistoryEntry {
  id: string; old_status: string | null; new_status: string; reason: string | null; changed_at: string;
  changed_by_user?: { full_name: string } | null;
}

export function useCustomerHistory(customerId: string | null) {
  const [reassignments, setReassignments] = useState<ReassignmentEntry[]>([]);
  const [statusHistory, setStatusHistory] = useState<StatusHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!customerId) { setReassignments([]); setStatusHistory([]); setLoading(false); return; }
    (async () => {
      setLoading(true);
      const [{ data: reassign }, { data: status }] = await Promise.all([
        supabase.from('customer_reassignment_history').select('id, field_name, old_value, new_value, changed_at, changed_by_user:app_users(full_name)').eq('customer_id', customerId).order('changed_at', { ascending: false }),
        supabase.from('customer_status_history').select('id, old_status, new_status, reason, changed_at, changed_by_user:app_users(full_name)').eq('customer_id', customerId).order('changed_at', { ascending: false }),
      ]);
      setReassignments((reassign ?? []) as unknown as ReassignmentEntry[]);
      setStatusHistory((status ?? []) as unknown as StatusHistoryEntry[]);
      setLoading(false);
    })();
  }, [customerId]);

  return { reassignments, statusHistory, loading };
}

export interface AuditLogEntry {
  id: string; action: string; old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null; created_at: string;
  user?: { full_name: string } | null;
}

export function useCustomerAuditHistory(customerId: string | null) {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!customerId) { setEntries([]); setLoading(false); return; }
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('audit_logs')
        .select('id, action, old_data, new_data, created_at, user:app_users(full_name)')
        .eq('entity_table', 'customers')
        .eq('entity_id', customerId)
        .order('created_at', { ascending: false })
        .limit(100);
      setEntries((data ?? []) as unknown as AuditLogEntry[]);
      setLoading(false);
    })();
  }, [customerId]);

  return { entries, loading };
}
