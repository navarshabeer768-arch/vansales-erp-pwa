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

export interface PostedInvoiceRow {
  invoice_number: string; final_invoice_number: string | null; invoice_date: string; customer_name: string;
  payment_type: string; net_amount: number; posted_date: string | null;
}
export interface UnpostedInvoiceRow {
  invoice_number: string; invoice_date: string; customer_name: string; status: string; net_amount: number;
}
export interface ApprovalReportRow {
  invoice_number: string; approval_type: string; required_role: string | null; status: string; request_time: string; action_time: string | null;
}
export interface PostingFailureRow {
  invoice_number: string; attempt_number: number; error_message: string | null; attempted_at: string;
}
export interface HoldReportRow {
  invoice_number: string; hold_reason: string; held_at: string; released_at: string | null;
}
export interface VoidReportRow {
  invoice_number: string; reason: string; approval_status: string; request_date: string;
}
export interface StockMovementRow {
  product_name: string; invoice_number: string; movement_type: string; quantity: number; created_at: string;
}

export function useInvoiceDraftReports(dateFrom: string, dateTo: string) {
  const { company } = useAuth();
  const [register, setRegister] = useState<InvoiceDraftRegisterRow[]>([]);
  const [orderConversions, setOrderConversions] = useState<InvoiceDraftRegisterRow[]>([]);
  const [directInvoices, setDirectInvoices] = useState<InvoiceDraftRegisterRow[]>([]);
  const [byEmployee, setByEmployee] = useState<EmployeeDraftInvoiceRow[]>([]);
  const [byVan, setByVan] = useState<VanDraftInvoiceRow[]>([]);
  const [posted, setPosted] = useState<PostedInvoiceRow[]>([]);
  const [unposted, setUnposted] = useState<UnpostedInvoiceRow[]>([]);
  const [approvals, setApprovals] = useState<ApprovalReportRow[]>([]);
  const [postingFailures, setPostingFailures] = useState<PostingFailureRow[]>([]);
  const [holds, setHolds] = useState<HoldReportRow[]>([]);
  const [voids, setVoids] = useState<VoidReportRow[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovementRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const toEnd = `${dateTo}T23:59:59`;

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

    const { data: postedData } = await supabase
      .from('sales_invoices')
      .select('invoice_number, final_invoice_number, invoice_date, payment_type, net_amount, posted_date, customer:customers(business_name), walk_in_name')
      .eq('company_id', company.id).eq('posting_status', 'posted')
      .gte('invoice_date', dateFrom).lte('invoice_date', dateTo);
    setPosted(((postedData ?? []) as any[]).map((r) => ({
      invoice_number: r.invoice_number, final_invoice_number: r.final_invoice_number, invoice_date: r.invoice_date,
      customer_name: r.customer?.business_name ?? r.walk_in_name ?? 'Walk-in', payment_type: r.payment_type, net_amount: r.net_amount, posted_date: r.posted_date,
    })));

    const { data: unpostedData } = await supabase
      .from('sales_invoices')
      .select('invoice_number, invoice_date, status, net_amount, customer:customers(business_name), walk_in_name')
      .eq('company_id', company.id).neq('posting_status', 'posted').neq('status', 'cancelled_before_posting')
      .gte('invoice_date', dateFrom).lte('invoice_date', dateTo);
    setUnposted(((unpostedData ?? []) as any[]).map((r) => ({
      invoice_number: r.invoice_number, invoice_date: r.invoice_date,
      customer_name: r.customer?.business_name ?? r.walk_in_name ?? 'Walk-in', status: r.status, net_amount: r.net_amount,
    })));

    const { data: approvalData } = await supabase
      .from('sales_invoice_approval_steps')
      .select('approval_type, required_role, status, request_time, action_time, approval:sales_invoice_approvals!inner(invoice_id, invoice:sales_invoices!inner(invoice_number, company_id))')
      .eq('approval.invoice.company_id', company.id).gte('request_time', dateFrom).lte('request_time', toEnd);
    setApprovals(((approvalData ?? []) as any[]).map((r) => ({
      invoice_number: r.approval?.invoice?.invoice_number, approval_type: r.approval_type, required_role: r.required_role,
      status: r.status, request_time: r.request_time, action_time: r.action_time,
    })));

    const { data: failureData } = await supabase
      .from('sales_invoice_posting_history')
      .select('attempt_number, error_message, attempted_at, invoice:sales_invoices(invoice_number, company_id)')
      .eq('status', 'failed').gte('attempted_at', dateFrom).lte('attempted_at', toEnd);
    setPostingFailures(((failureData ?? []) as any[]).filter((r) => r.invoice?.company_id === company.id).map((r) => ({
      invoice_number: r.invoice?.invoice_number, attempt_number: r.attempt_number, error_message: r.error_message, attempted_at: r.attempted_at,
    })));

    const { data: holdData } = await supabase
      .from('sales_invoice_hold_history')
      .select('hold_reason, held_at, released_at, invoice:sales_invoices!inner(invoice_number, company_id)')
      .eq('invoice.company_id', company.id).gte('held_at', dateFrom).lte('held_at', toEnd);
    setHolds(((holdData ?? []) as any[]).map((r) => ({
      invoice_number: r.invoice?.invoice_number, hold_reason: r.hold_reason, held_at: r.held_at, released_at: r.released_at,
    })));

    const { data: voidData } = await supabase
      .from('sales_invoice_void_requests')
      .select('reason, approval_status, request_date, invoice:sales_invoices!inner(invoice_number, company_id)')
      .eq('invoice.company_id', company.id).gte('request_date', dateFrom).lte('request_date', toEnd);
    setVoids(((voidData ?? []) as any[]).map((r) => ({
      invoice_number: r.invoice?.invoice_number, reason: r.reason, approval_status: r.approval_status, request_date: r.request_date,
    })));

    const { data: movementData } = await supabase
      .from('stock_movements')
      .select('quantity, movement_type, created_at, product:products(name), reference_id')
      .eq('company_id', company.id).eq('reference_table', 'sales_invoices')
      .gte('created_at', dateFrom).lte('created_at', toEnd);
    const invoiceIds = [...new Set(((movementData ?? []) as any[]).map((r) => r.reference_id))];
    const { data: invoiceLookup } = invoiceIds.length
      ? await supabase.from('sales_invoices').select('id, invoice_number').in('id', invoiceIds)
      : { data: [] as any[] };
    const invoiceMap = new Map((invoiceLookup ?? []).map((i: any) => [i.id, i.invoice_number]));
    setStockMovements(((movementData ?? []) as any[]).map((r) => ({
      product_name: r.product?.name ?? '—', invoice_number: invoiceMap.get(r.reference_id) ?? '—',
      movement_type: r.movement_type, quantity: r.quantity, created_at: r.created_at,
    })));

    setLoading(false);
  }, [company, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  return {
    register, orderConversions, directInvoices, byEmployee, byVan,
    posted, unposted, approvals, postingFailures, holds, voids, stockMovements,
    loading, reload: load,
  };
}
