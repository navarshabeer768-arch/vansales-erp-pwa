import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface ReturnDraftRegisterRow {
  return_number: string; return_date: string; customer_name: string; return_type: string;
  status: string; validation_status: string; net_return_amount: number;
}
export interface EmployeeReturnRow { employee_name: string; return_count: number; total_amount: number; }
export interface VanReturnRow { van_name: string; return_count: number; total_amount: number; }

export function useReturnDraftReports(dateFrom: string, dateTo: string) {
  const { company } = useAuth();
  const [register, setRegister] = useState<ReturnDraftRegisterRow[]>([]);
  const [invoiceBased, setInvoiceBased] = useState<ReturnDraftRegisterRow[]>([]);
  const [withoutInvoice, setWithoutInvoice] = useState<ReturnDraftRegisterRow[]>([]);
  const [damaged, setDamaged] = useState<ReturnDraftRegisterRow[]>([]);
  const [expired, setExpired] = useState<ReturnDraftRegisterRow[]>([]);
  const [byEmployee, setByEmployee] = useState<EmployeeReturnRow[]>([]);
  const [byVan, setByVan] = useState<VanReturnRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);

    const { data } = await supabase
      .from('sales_returns')
      .select(`
        return_number, return_date, status, validation_status, net_return_amount, original_invoice_id,
        customer:customers(business_name), return_type:sales_return_types(code, label),
        responsible_employee:app_users!sales_returns_responsible_employee_id_fkey(full_name), van:vans(name)
      `)
      .eq('company_id', company.id)
      .gte('return_date', dateFrom).lte('return_date', dateTo);

    const rows = ((data ?? []) as any[]).map((r) => ({
      return_number: r.return_number, return_date: r.return_date,
      customer_name: r.customer?.business_name ?? '—', return_type: r.return_type?.label ?? '—',
      status: r.status, validation_status: r.validation_status, net_return_amount: r.net_return_amount,
      _typeCode: r.return_type?.code, _hasInvoice: !!r.original_invoice_id,
      _employee: r.responsible_employee?.full_name, _van: r.van?.name,
    }));

    setRegister(rows.map(({ _typeCode, _hasInvoice, _employee, _van, ...rest }) => rest));
    setInvoiceBased(rows.filter((r) => r._hasInvoice).map(({ _typeCode, _hasInvoice, _employee, _van, ...rest }) => rest));
    setWithoutInvoice(rows.filter((r) => !r._hasInvoice).map(({ _typeCode, _hasInvoice, _employee, _van, ...rest }) => rest));
    setDamaged(rows.filter((r) => r._typeCode === 'damaged_product_return').map(({ _typeCode, _hasInvoice, _employee, _van, ...rest }) => rest));
    setExpired(rows.filter((r) => r._typeCode === 'expired_product_return').map(({ _typeCode, _hasInvoice, _employee, _van, ...rest }) => rest));

    const employeeMap = new Map<string, { count: number; total: number }>();
    for (const r of rows) {
      const key = (r as any)._employee ?? 'Unassigned';
      const entry = employeeMap.get(key) ?? { count: 0, total: 0 };
      entry.count += 1; entry.total += r.net_return_amount;
      employeeMap.set(key, entry);
    }
    setByEmployee(Array.from(employeeMap.entries()).map(([employee_name, v]) => ({ employee_name, return_count: v.count, total_amount: v.total })));

    const vanMap = new Map<string, { count: number; total: number }>();
    for (const r of rows) {
      const key = (r as any)._van ?? 'Unassigned';
      const entry = vanMap.get(key) ?? { count: 0, total: 0 };
      entry.count += 1; entry.total += r.net_return_amount;
      vanMap.set(key, entry);
    }
    setByVan(Array.from(vanMap.entries()).map(([van_name, v]) => ({ van_name, return_count: v.count, total_amount: v.total })));

    setLoading(false);
  }, [company, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  return { register, invoiceBased, withoutInvoice, damaged, expired, byEmployee, byVan, loading, reload: load };
}
