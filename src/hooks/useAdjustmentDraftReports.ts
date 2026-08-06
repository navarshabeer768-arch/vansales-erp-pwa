import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface AdjustmentDraftRow {
  document_number: string; document_date: string; customer_name: string; document_type: string;
  status: string; net_amount: number;
}
export interface EmployeeAdjustmentRow { employee_name: string; document_count: number; total_amount: number; }
export interface VanAdjustmentRow { van_name: string; document_count: number; total_amount: number; }

export function useAdjustmentDraftReports(dateFrom: string, dateTo: string) {
  const { company } = useAuth();
  const [creditNoteRegister, setCreditNoteRegister] = useState<AdjustmentDraftRow[]>([]);
  const [debitNoteRegister, setDebitNoteRegister] = useState<AdjustmentDraftRow[]>([]);
  const [customerAdjustmentRegister, setCustomerAdjustmentRegister] = useState<AdjustmentDraftRow[]>([]);
  const [priceAdjustments, setPriceAdjustments] = useState<AdjustmentDraftRow[]>([]);
  const [quantityAdjustments, setQuantityAdjustments] = useState<AdjustmentDraftRow[]>([]);
  const [discountAdjustments, setDiscountAdjustments] = useState<AdjustmentDraftRow[]>([]);
  const [promotionAdjustments, setPromotionAdjustments] = useState<AdjustmentDraftRow[]>([]);
  const [taxAdjustments, setTaxAdjustments] = useState<AdjustmentDraftRow[]>([]);
  const [byEmployee, setByEmployee] = useState<EmployeeAdjustmentRow[]>([]);
  const [byVan, setByVan] = useState<VanAdjustmentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);

    const [{ data: cnData }, { data: dnData }, { data: caData }] = await Promise.all([
      supabase.from('credit_notes').select(`
        document_number, document_date, status, net_amount, adjustment_type,
        customer:customers(business_name), document_type:financial_document_types(label),
        responsible_employee:app_users!credit_notes_responsible_employee_id_fkey(full_name), van:vans(name)
      `).eq('company_id', company.id).gte('document_date', dateFrom).lte('document_date', dateTo),
      supabase.from('debit_notes').select(`
        document_number, document_date, status, net_amount, adjustment_type,
        customer:customers(business_name), document_type:financial_document_types(label),
        responsible_employee:app_users!debit_notes_responsible_employee_id_fkey(full_name), van:vans(name)
      `).eq('company_id', company.id).gte('document_date', dateFrom).lte('document_date', dateTo),
      supabase.from('customer_adjustments').select(`
        document_number, document_date, status, net_amount, adjustment_type,
        customer:customers(business_name), document_type:financial_document_types(label),
        responsible_employee:app_users!customer_adjustments_responsible_employee_id_fkey(full_name), van:vans(name)
      `).eq('company_id', company.id).gte('document_date', dateFrom).lte('document_date', dateTo),
    ]);

    const mapRow = (r: any): AdjustmentDraftRow & { _type: string; _employee: string; _van: string } => ({
      document_number: r.document_number, document_date: r.document_date,
      customer_name: r.customer?.business_name ?? '—', document_type: r.document_type?.label ?? '—',
      status: r.status, net_amount: r.net_amount, _type: r.adjustment_type,
      _employee: r.responsible_employee?.full_name ?? 'Unassigned', _van: r.van?.name ?? 'Unassigned',
    });

    const cnRows = ((cnData ?? []) as any[]).map(mapRow);
    const dnRows = ((dnData ?? []) as any[]).map(mapRow);
    const caRows = ((caData ?? []) as any[]).map(mapRow);
    const allRows = [...cnRows, ...dnRows, ...caRows];

    setCreditNoteRegister(cnRows);
    setDebitNoteRegister(dnRows);
    setCustomerAdjustmentRegister(caRows);
    setPriceAdjustments(caRows.filter((r) => r._type === 'price_adjustment'));
    setQuantityAdjustments(caRows.filter((r) => r._type === 'quantity_adjustment'));
    setDiscountAdjustments(caRows.filter((r) => r._type === 'discount_adjustment'));
    setPromotionAdjustments(caRows.filter((r) => r._type === 'promotion_adjustment'));
    setTaxAdjustments(caRows.filter((r) => r._type === 'tax_adjustment'));

    const employeeMap = new Map<string, { count: number; total: number }>();
    for (const r of allRows) {
      const entry = employeeMap.get(r._employee) ?? { count: 0, total: 0 };
      entry.count += 1; entry.total += r.net_amount;
      employeeMap.set(r._employee, entry);
    }
    setByEmployee(Array.from(employeeMap.entries()).map(([employee_name, v]) => ({ employee_name, document_count: v.count, total_amount: v.total })));

    const vanMap = new Map<string, { count: number; total: number }>();
    for (const r of allRows) {
      const entry = vanMap.get(r._van) ?? { count: 0, total: 0 };
      entry.count += 1; entry.total += r.net_amount;
      vanMap.set(r._van, entry);
    }
    setByVan(Array.from(vanMap.entries()).map(([van_name, v]) => ({ van_name, document_count: v.count, total_amount: v.total })));

    setLoading(false);
  }, [company, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  return {
    creditNoteRegister, debitNoteRegister, customerAdjustmentRegister,
    priceAdjustments, quantityAdjustments, discountAdjustments, promotionAdjustments, taxAdjustments,
    byEmployee, byVan, loading, reload: load,
  };
}
