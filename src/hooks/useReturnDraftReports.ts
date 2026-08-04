import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface ReturnDraftRegisterRow {
  return_number: string; return_date: string; customer_name: string; return_type: string;
  status: string; validation_status: string; net_return_amount: number;
}
export interface EmployeeReturnRow { employee_name: string; return_count: number; total_amount: number; }
export interface VanReturnRow { van_name: string; return_count: number; total_amount: number; }
export interface PostedReturnRow {
  return_number: string; return_date: string; customer_name: string; return_type: string;
  status: string; net_return_amount: number; posted_date: string | null;
}
export interface StockDestinationRow {
  return_number: string; product_name: string; destination: string; quantity: number; posted_at: string;
}
export interface CreditNoteRow {
  credit_note_number: string; return_number: string; customer_name: string; approved_credit_amount: number; status: string; created_at: string;
}
export interface ReplacementOrderRow {
  return_number: string; customer_name: string; status: string; value_rule: string; created_at: string;
}

export function useReturnDraftReports(dateFrom: string, dateTo: string) {
  const { company } = useAuth();
  const [register, setRegister] = useState<ReturnDraftRegisterRow[]>([]);
  const [invoiceBased, setInvoiceBased] = useState<ReturnDraftRegisterRow[]>([]);
  const [withoutInvoice, setWithoutInvoice] = useState<ReturnDraftRegisterRow[]>([]);
  const [damaged, setDamaged] = useState<ReturnDraftRegisterRow[]>([]);
  const [expired, setExpired] = useState<ReturnDraftRegisterRow[]>([]);
  const [byEmployee, setByEmployee] = useState<EmployeeReturnRow[]>([]);
  const [byVan, setByVan] = useState<VanReturnRow[]>([]);
  const [posted, setPosted] = useState<PostedReturnRow[]>([]);
  const [stockDestinations, setStockDestinations] = useState<StockDestinationRow[]>([]);
  const [creditNotes, setCreditNotes] = useState<CreditNoteRow[]>([]);
  const [replacementOrders, setReplacementOrders] = useState<ReplacementOrderRow[]>([]);
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

    const toEnd = `${dateTo}T23:59:59`;

    const { data: postedData } = await supabase
      .from('sales_returns')
      .select('return_number, return_date, status, net_return_amount, posted_date, customer:customers(business_name), return_type:sales_return_types(label)')
      .eq('company_id', company.id).eq('posting_status', 'posted')
      .gte('return_date', dateFrom).lte('return_date', dateTo);
    setPosted(((postedData ?? []) as any[]).map((r) => ({
      return_number: r.return_number, return_date: r.return_date, customer_name: r.customer?.business_name ?? '—',
      return_type: r.return_type?.label ?? '—', status: r.status, net_return_amount: r.net_return_amount, posted_date: r.posted_date,
    })));

    const { data: destData } = await supabase
      .from('sales_return_stock_postings')
      .select('quantity, destination_code, posted_at, return:sales_returns!inner(return_number, company_id), return_item:sales_return_items(product:products(name))')
      .eq('return.company_id', company.id).gte('posted_at', dateFrom).lte('posted_at', toEnd);
    setStockDestinations(((destData ?? []) as any[]).map((r) => ({
      return_number: r.return?.return_number ?? '—', product_name: r.return_item?.product?.name ?? '—',
      destination: r.destination_code.replace(/_/g, ' '), quantity: r.quantity, posted_at: r.posted_at,
    })));

    const { data: cnData } = await supabase
      .from('sales_return_credit_notes')
      .select('credit_note_number, approved_credit_amount, status, created_at, return:sales_returns!inner(return_number, company_id), customer:customers(business_name)')
      .eq('return.company_id', company.id).gte('created_at', dateFrom).lte('created_at', toEnd);
    setCreditNotes(((cnData ?? []) as any[]).map((r) => ({
      credit_note_number: r.credit_note_number, return_number: r.return?.return_number ?? '—',
      customer_name: r.customer?.business_name ?? '—', approved_credit_amount: r.approved_credit_amount, status: r.status, created_at: r.created_at,
    })));

    const { data: repData } = await supabase
      .from('sales_return_replacement_orders')
      .select('status, value_rule, created_at, return:sales_returns!inner(return_number, company_id), customer:customers(business_name)')
      .eq('return.company_id', company.id).gte('created_at', dateFrom).lte('created_at', toEnd);
    setReplacementOrders(((repData ?? []) as any[]).map((r) => ({
      return_number: r.return?.return_number ?? '—', customer_name: r.customer?.business_name ?? '—',
      status: r.status, value_rule: r.value_rule, created_at: r.created_at,
    })));

    setLoading(false);
  }, [company, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  return {
    register, invoiceBased, withoutInvoice, damaged, expired, byEmployee, byVan,
    posted, stockDestinations, creditNotes, replacementOrders, loading, reload: load,
  };
}
