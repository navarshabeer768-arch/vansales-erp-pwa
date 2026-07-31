import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface OpeningBalance {
  id: string; customer_id: string; balance_type: 'debit' | 'credit'; amount: number;
  reference_number: string | null; posting_date: string; remarks: string | null;
  status: 'pending' | 'approved' | 'rejected'; journal_entry_id: string | null;
  customer?: { business_name: string } | null;
}

export function useCustomerOpeningBalance(customerId: string | null) {
  const { company } = useAuth();
  const [balance, setBalance] = useState<OpeningBalance | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company || !customerId) { setBalance(null); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase.from('customer_opening_balances').select('*').eq('customer_id', customerId).maybeSingle();
    setBalance((data as OpeningBalance) ?? null);
    setLoading(false);
  }, [company, customerId]);

  useEffect(() => { load(); }, [load]);

  const create = useCallback(async (input: { balanceType: 'debit' | 'credit'; amount: number; referenceNumber?: string; postingDate?: string; remarks?: string }) => {
    if (!company || !customerId) return { error: 'Missing context' };
    const { error } = await supabase.from('customer_opening_balances').insert({
      company_id: company.id, customer_id: customerId, balance_type: input.balanceType, amount: input.amount,
      reference_number: input.referenceNumber || null, posting_date: input.postingDate || new Date().toISOString().slice(0, 10),
      remarks: input.remarks || null,
    });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [company, customerId, load]);

  const approve = useCallback(async () => {
    if (!balance) return { error: 'No opening balance to approve' };
    const { error } = await supabase.rpc('approve_customer_opening_balance', { p_opening_balance_id: balance.id });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [balance, load]);

  const reject = useCallback(async (reason: string) => {
    if (!balance) return { error: 'No opening balance to reject' };
    const { error } = await supabase.rpc('reject_customer_opening_balance', { p_opening_balance_id: balance.id, p_reason: reason });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [balance, load]);

  return { balance, loading, create, approve, reject, reload: load };
}

export function usePendingOpeningBalances() {
  const { company } = useAuth();
  const [pending, setPending] = useState<OpeningBalance[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data } = await supabase.from('customer_opening_balances').select('*, customer:customers(business_name)').eq('company_id', company.id).eq('status', 'pending');
    setPending((data ?? []) as unknown as OpeningBalance[]);
    setLoading(false);
  }, [company]);

  useEffect(() => { load(); }, [load]);

  return { pending, loading, reload: load };
}

export interface LedgerSummary { opening_balance: number; current_balance: number; last_transaction_at: string | null; }

export interface LedgerTransaction {
  id: string; transaction_type: string; debit: number; credit: number; running_balance: number | null;
  transaction_date: string; description: string | null;
}

export function useCustomerLedger(customerId: string | null) {
  const [summary, setSummary] = useState<LedgerSummary | null>(null);
  const [transactions, setTransactions] = useState<LedgerTransaction[]>([]);
  const [aging, setAging] = useState<{ bucket_label: string; amount: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!customerId) { setSummary(null); setTransactions([]); setAging([]); setLoading(false); return; }
    (async () => {
      setLoading(true);
      const [{ data: ledger }, { data: txns }, { data: agingData }] = await Promise.all([
        supabase.from('customer_ledger').select('opening_balance, current_balance, last_transaction_at').eq('customer_id', customerId).maybeSingle(),
        supabase.from('customer_ledger_transactions').select('id, transaction_type, debit, credit, running_balance, transaction_date, description').eq('customer_id', customerId).order('transaction_date', { ascending: false }),
        supabase.rpc('customer_aging_summary', { p_customer_id: customerId }),
      ]);
      setSummary((ledger as LedgerSummary) ?? { opening_balance: 0, current_balance: 0, last_transaction_at: null });
      setTransactions((txns ?? []) as LedgerTransaction[]);
      setAging((agingData ?? []) as { bucket_label: string; amount: number }[]);
      setLoading(false);
    })();
  }, [customerId]);

  return { summary, transactions, aging, loading };
}

export interface PricingDashboardStats {
  totalPriceLists: number;
  customersByPriceList: { label: string; count: number }[];
  productsWithSpecialPrices: number;
  temporaryDiscounts: number;
  expiredPriceLists: number;
  upcomingExpiry: number;
  openingBalanceTotal: number;
}

export function usePricingDashboard() {
  const { company } = useAuth();
  const [stats, setStats] = useState<PricingDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!company) return;
    (async () => {
      setLoading(true);
      const [{ data: priceLists }, { data: assignments }, specialPricesRes, discountsRes, { data: openingBalances }] = await Promise.all([
        supabase.from('price_lists').select('id, status, expiry_date, name').eq('company_id', company.id),
        supabase.from('customer_price_lists').select('price_list_id, price_list:price_lists(name)').eq('company_id', company.id),
        supabase.from('customer_product_prices').select('id', { count: 'exact', head: true }).eq('company_id', company.id).eq('is_active', true),
        supabase.from('customer_discounts').select('id', { count: 'exact', head: true }).eq('company_id', company.id).eq('is_temporary', true).eq('status', 'active'),
        supabase.from('customer_opening_balances').select('amount, balance_type').eq('company_id', company.id).eq('status', 'approved'),
      ]);

      const lists = (priceLists ?? []) as any[];
      const today = new Date().toISOString().slice(0, 10);
      const inThirtyDays = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

      const grouped = new Map<string, number>();
      for (const a of (assignments ?? []) as any[]) {
        const label = a.price_list?.name ?? 'Unknown';
        grouped.set(label, (grouped.get(label) ?? 0) + 1);
      }

      setStats({
        totalPriceLists: lists.length,
        customersByPriceList: Array.from(grouped.entries()).map(([label, count]) => ({ label, count })),
        productsWithSpecialPrices: specialPricesRes.count ?? 0,
        temporaryDiscounts: discountsRes.count ?? 0,
        expiredPriceLists: lists.filter((l) => l.status === 'expired' || (l.expiry_date && l.expiry_date < today)).length,
        upcomingExpiry: lists.filter((l) => l.expiry_date && l.expiry_date >= today && l.expiry_date <= inThirtyDays).length,
        openingBalanceTotal: ((openingBalances ?? []) as any[]).reduce((sum, ob) => sum + (ob.balance_type === 'debit' ? ob.amount : -ob.amount), 0),
      });
      setLoading(false);
    })();
  }, [company]);

  return { stats, loading };
}
