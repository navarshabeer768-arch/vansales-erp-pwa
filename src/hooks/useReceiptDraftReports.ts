import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface ReceiptDraftRegisterRow {
  receipt_number: string; receipt_date: string; customer_name: string; collection_type: string;
  status: string; allocation_status: string; receipt_amount: number;
}
export interface EmployeeCollectionRow { employee_name: string; receipt_count: number; total_amount: number; }
export interface VanCollectionRow { van_name: string; receipt_count: number; total_amount: number; }

export function useReceiptDraftReports(dateFrom: string, dateTo: string) {
  const { company } = useAuth();
  const [register, setRegister] = useState<ReceiptDraftRegisterRow[]>([]);
  const [cashDrafts, setCashDrafts] = useState<ReceiptDraftRegisterRow[]>([]);
  const [chequeDrafts, setChequeDrafts] = useState<ReceiptDraftRegisterRow[]>([]);
  const [byEmployee, setByEmployee] = useState<EmployeeCollectionRow[]>([]);
  const [byVan, setByVan] = useState<VanCollectionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);

    const { data } = await supabase
      .from('receipt_vouchers')
      .select(`
        receipt_number, receipt_date, status, allocation_status, receipt_amount,
        customer:customers(business_name), collection_type:collection_types(label),
        responsible_employee:app_users!receipt_vouchers_responsible_employee_id_fkey(full_name),
        van:vans(name), payment_components:receipt_payment_components(payment_method_code)
      `)
      .eq('company_id', company.id)
      .gte('receipt_date', dateFrom).lte('receipt_date', dateTo);

    const rows = ((data ?? []) as any[]).map((r) => ({
      receipt_number: r.receipt_number, receipt_date: r.receipt_date,
      customer_name: r.customer?.business_name ?? '—', collection_type: r.collection_type?.label ?? '—',
      status: r.status, allocation_status: r.allocation_status, receipt_amount: r.receipt_amount,
      _methods: (r.payment_components ?? []).map((p: any) => p.payment_method_code) as string[],
      _employee: r.responsible_employee?.full_name, _van: r.van?.name,
    }));

    setRegister(rows.map(({ _methods, _employee, _van, ...rest }) => rest));
    setCashDrafts(rows.filter((r) => r._methods.includes('cash')).map(({ _methods, _employee, _van, ...rest }) => rest));
    setChequeDrafts(rows.filter((r) => r._methods.includes('cheque')).map(({ _methods, _employee, _van, ...rest }) => rest));

    const employeeMap = new Map<string, { count: number; total: number }>();
    for (const r of rows) {
      const key = (r as any)._employee ?? 'Unassigned';
      const entry = employeeMap.get(key) ?? { count: 0, total: 0 };
      entry.count += 1; entry.total += r.receipt_amount;
      employeeMap.set(key, entry);
    }
    setByEmployee(Array.from(employeeMap.entries()).map(([employee_name, v]) => ({ employee_name, receipt_count: v.count, total_amount: v.total })));

    const vanMap = new Map<string, { count: number; total: number }>();
    for (const r of rows) {
      const key = (r as any)._van ?? 'Unassigned';
      const entry = vanMap.get(key) ?? { count: 0, total: 0 };
      entry.count += 1; entry.total += r.receipt_amount;
      vanMap.set(key, entry);
    }
    setByVan(Array.from(vanMap.entries()).map(([van_name, v]) => ({ van_name, receipt_count: v.count, total_amount: v.total })));

    setLoading(false);
  }, [company, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  return { register, cashDrafts, chequeDrafts, byEmployee, byVan, loading, reload: load };
}
