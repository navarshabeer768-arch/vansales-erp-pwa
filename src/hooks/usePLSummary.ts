import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface PLSummary {
  revenue: number;
  discounts: number;
  taxCollected: number;
  cogs: number;
  expenses: number;
  grossProfit: number;
  netProfit: number;
}

/**
 * A lightweight computed P&L, not a full double-entry ledger report.
 * COGS is estimated from each sale line's quantity x the product's *current*
 * cost_price (not the historical cost at time of sale) — good enough for a
 * quick read, but a proper journal-based P&L should use `accounts` /
 * `journal_entries` for period-accurate costing.
 */
export function usePLSummary(startDate: string, endDate: string) {
  const { company } = useAuth();
  const [summary, setSummary] = useState<PLSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);

    const { data: sales } = await supabase
      .from('sales')
      .select('subtotal, discount_amount, tax_amount, total_amount')
      .eq('company_id', company.id)
      .eq('status', 'completed')
      .gte('created_at', startDate)
      .lte('created_at', `${endDate}T23:59:59`);

    const { data: saleItems } = await supabase
      .from('sale_items')
      .select('quantity, product:products!inner(cost_price), sale:sales!inner(company_id, created_at, status)')
      .eq('sale.company_id', company.id)
      .eq('sale.status', 'completed')
      .gte('sale.created_at', startDate)
      .lte('sale.created_at', `${endDate}T23:59:59`);

    const { data: expenseRows } = await supabase
      .from('expenses')
      .select('amount')
      .eq('company_id', company.id)
      .gte('created_at', startDate)
      .lte('created_at', `${endDate}T23:59:59`);

    const revenue = (sales ?? []).reduce((sum, s) => sum + s.subtotal, 0);
    const discounts = (sales ?? []).reduce((sum, s) => sum + s.discount_amount, 0);
    const taxCollected = (sales ?? []).reduce((sum, s) => sum + s.tax_amount, 0);
    const cogs = (saleItems ?? []).reduce((sum: number, it: any) => sum + it.quantity * (it.product?.cost_price ?? 0), 0);
    const expensesTotal = (expenseRows ?? []).reduce((sum, e) => sum + e.amount, 0);
    const grossProfit = revenue - discounts - cogs;
    const netProfit = grossProfit - expensesTotal;

    setSummary({ revenue, discounts, taxCollected, cogs, expenses: expensesTotal, grossProfit, netProfit });
    setLoading(false);
  }, [company, startDate, endDate]);

  useEffect(() => { load(); }, [load]);

  return { summary, loading, reload: load };
}
