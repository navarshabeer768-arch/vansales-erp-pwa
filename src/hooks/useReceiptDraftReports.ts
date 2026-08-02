import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface ReceiptDraftRegisterRow {
  receipt_number: string; receipt_date: string; customer_name: string; collection_type: string;
  status: string; allocation_status: string; receipt_amount: number;
}
export interface EmployeeCollectionRow { employee_name: string; receipt_count: number; total_amount: number; }
export interface VanCollectionRow { van_name: string; receipt_count: number; total_amount: number; }
export interface AllocationDraftRow {
  receipt_number: string; customer_name: string; invoice_number: string | null; final_invoice_number: string | null;
  invoice_outstanding_snapshot: number; allocated_amount: number; allocation_method: string;
}
export interface PromiseReportRow {
  customer_name: string; promised_amount: number; promise_date: string; status: string; employee_notes: string | null;
}

export function useReceiptDraftReports(dateFrom: string, dateTo: string) {
  const { company } = useAuth();
  const [register, setRegister] = useState<ReceiptDraftRegisterRow[]>([]);
  const [cashDrafts, setCashDrafts] = useState<ReceiptDraftRegisterRow[]>([]);
  const [chequeDrafts, setChequeDrafts] = useState<ReceiptDraftRegisterRow[]>([]);
  const [byEmployee, setByEmployee] = useState<EmployeeCollectionRow[]>([]);
  const [byVan, setByVan] = useState<VanCollectionRow[]>([]);
  const [cardDrafts, setCardDrafts] = useState<ReceiptDraftRegisterRow[]>([]);
  const [bankDrafts, setBankDrafts] = useState<ReceiptDraftRegisterRow[]>([]);
  const [advanceDrafts, setAdvanceDrafts] = useState<ReceiptDraftRegisterRow[]>([]);
  const [unallocatedDrafts, setUnallocatedDrafts] = useState<ReceiptDraftRegisterRow[]>([]);
  const [mixedDrafts, setMixedDrafts] = useState<ReceiptDraftRegisterRow[]>([]);
  const [routeDrafts, setRouteDrafts] = useState<ReceiptDraftRegisterRow[]>([]);
  const [offlineDrafts, setOfflineDrafts] = useState<ReceiptDraftRegisterRow[]>([]);
  const [allocations, setAllocations] = useState<AllocationDraftRow[]>([]);
  const [promises, setPromises] = useState<PromiseReportRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);

    const { data } = await supabase
      .from('receipt_vouchers')
      .select(`
        receipt_number, receipt_date, status, allocation_status, receipt_amount, collection_source,
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
      _employee: r.responsible_employee?.full_name, _van: r.van?.name, _source: r.collection_source,
    }));

    setRegister(rows.map(({ _methods, _employee, _van, _source, ...rest }) => rest));
    setCashDrafts(rows.filter((r) => r._methods.includes('cash')).map(({ _methods, _employee, _van, _source, ...rest }) => rest));
    setChequeDrafts(rows.filter((r) => r._methods.includes('cheque')).map(({ _methods, _employee, _van, _source, ...rest }) => rest));
    setCardDrafts(rows.filter((r) => r._methods.includes('card')).map(({ _methods, _employee, _van, _source, ...rest }) => rest));
    setBankDrafts(rows.filter((r) => r._methods.includes('bank_transfer')).map(({ _methods, _employee, _van, _source, ...rest }) => rest));
    setAdvanceDrafts(rows.filter((r) => r.allocation_status === 'advance').map(({ _methods, _employee, _van, _source, ...rest }) => rest));
    setUnallocatedDrafts(rows.filter((r) => r.allocation_status === 'unallocated').map(({ _methods, _employee, _van, _source, ...rest }) => rest));
    setMixedDrafts(rows.filter((r) => r._methods.length > 1).map(({ _methods, _employee, _van, _source, ...rest }) => rest));
    setRouteDrafts(rows.filter((r) => r._source === 'route' || r._source === 'van').map(({ _methods, _employee, _van, _source, ...rest }) => rest));
    setOfflineDrafts(rows.filter((r) => r._source === 'offline' || r.status === 'sync_pending' || r.status === 'sync_failed').map(({ _methods, _employee, _van, _source, ...rest }) => rest));

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

    const { data: allocData } = await supabase
      .from('receipt_invoice_allocations')
      .select('invoice_outstanding_snapshot, allocated_amount, allocation_method, receipt:receipt_vouchers!inner(receipt_number, company_id, customer:customers(business_name)), invoice:sales_invoices(invoice_number, final_invoice_number)')
      .eq('receipt.company_id', company.id).eq('status', 'active');
    setAllocations(((allocData ?? []) as any[]).map((a) => ({
      receipt_number: a.receipt?.receipt_number, customer_name: a.receipt?.customer?.business_name ?? '—',
      invoice_number: a.invoice?.invoice_number ?? null, final_invoice_number: a.invoice?.final_invoice_number ?? null,
      invoice_outstanding_snapshot: a.invoice_outstanding_snapshot, allocated_amount: a.allocated_amount, allocation_method: a.allocation_method,
    })));

    const { data: promiseData } = await supabase
      .from('payment_promises')
      .select('promised_amount, promise_date, status, employee_notes, customer:customers(business_name)')
      .eq('company_id', company.id).gte('promise_date', dateFrom).lte('promise_date', dateTo);
    setPromises(((promiseData ?? []) as any[]).map((p) => ({
      customer_name: p.customer?.business_name ?? '—', promised_amount: p.promised_amount, promise_date: p.promise_date,
      status: p.status, employee_notes: p.employee_notes,
    })));

    setLoading(false);
  }, [company, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  return {
    register, cashDrafts, chequeDrafts, cardDrafts, bankDrafts, advanceDrafts, unallocatedDrafts,
    mixedDrafts, routeDrafts, offlineDrafts, allocations, promises, byEmployee, byVan, loading, reload: load,
  };
}
