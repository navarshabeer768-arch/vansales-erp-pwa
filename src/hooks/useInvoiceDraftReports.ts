import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface InvoiceDraftRegisterRow {
  invoice_number: string;
  invoice_date: string;
  customer_name: string;
  invoice_type: string;
  payment_type: string;
  status: string;
  net_amount: number;
  is_direct_invoice: boolean;
}

export interface EmployeeDraftInvoiceRow {
  employee_name: string;
  invoice_count: number;
  total_net_amount: number;
}

export interface VanDraftInvoiceRow {
  van_name: string;
  invoice_count: number;
  total_net_amount: number;
}

export function useInvoiceDraftReports(dateFrom: string, dateTo: string) {
  const { company } = useAuth();
  const [register, setRegister] = useState<InvoiceDraftRegisterRow[]>([]);
  const [orderConversions, setOrderConversions] = useState<InvoiceDraftRegisterRow[]>([]);
  const [directInvoices, setDirectInvoices] = useState<InvoiceDraftRegisterRow[]>([]);
  const [byEmployee, setByEmployee] = useState<EmployeeDraftInvoiceRow[]>([]);
  const [byVan, setByVan] = useState<VanDraftInvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);

    const { data } = await supabase
      .from('sales_invoices')
      .select(`
        invoice_number, invoice_date, status, net_amount, payment_type, is_direct_invoice,
        customer:customers(business_name), walk_in_name,
        invoice_type:sales_invoice_types(label),
        salesman:app_users!sales_invoices_salesman_id_fkey(full_name),
        van:vans(name)
      `)
      .eq('company_id', company.id)
      .gte('invoice_date', dateFrom).lte('invoice_date', dateTo);

    const rows = ((data ?? []) as any[]).map((r) => ({
      invoice_number: r.invoice_number, invoice_date: r.invoice_date,
      customer_name: r.customer?.business_name ?? r.walk_in_name ?? 'Walk-in',
      invoice_type: r.invoice_type?.label ?? '—', payment_type: r.payment_type, status: r.status,
      net_amount: r.net_amount, is_direct_invoice: r.is_direct_invoice,
      _salesman: r.salesman?.full_name, _van: r.van?.name,
    }));

    setRegister(rows.map(({ _salesman, _van, ...rest }) => rest));
    setOrderConversions(rows.filter((r) => !r.is_direct_invoice).map(({ _salesman, _van, ...rest }) => rest));
    setDirectInvoices(rows.filter((r) => r.is_direct_invoice).map(({ _salesman, _van, ...rest }) => rest));

    const employeeMap = new Map<string, { count: number; total: number }>();
    for (const r of rows) {
      const key = (r as any)._salesman ?? 'Unassigned';
      const entry = employeeMap.get(key) ?? { count: 0, total: 0 };
      entry.count += 1; entry.total += r.net_amount;
      employeeMap.set(key, entry);
    }
    setByEmployee(Array.from(employeeMap.entries()).map(([employee_name, v]) => ({ employee_name, invoice_count: v.count, total_net_amount: v.total })));

    const vanMap = new Map<string, { count: number; total: number }>();
    for (const r of rows) {
      const key = (r as any)._van ?? 'Unassigned';
      const entry = vanMap.get(key) ?? { count: 0, total: 0 };
      entry.count += 1; entry.total += r.net_amount;
      vanMap.set(key, entry);
    }
    setByVan(Array.from(vanMap.entries()).map(([van_name, v]) => ({ van_name, invoice_count: v.count, total_net_amount: v.total })));

    setLoading(false);
  }, [company, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  return { register, orderConversions, directInvoices, byEmployee, byVan, loading, reload: load };
}
