import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface Collection {
  id: string;
  receipt_no: string;
  customer_id: string;
  method: 'cash' | 'card' | 'bank' | 'cheque' | 'pdc';
  amount: number;
  reference_no: string | null;
  cheque_date: string | null;
  applied_to_sale_id: string | null;
  notes: string | null;
  created_at: string;
  customer?: { id: string; business_name: string } | null;
}

export interface CustomerWithBalance {
  id: string;
  business_name: string;
  customer_code: string;
  outstanding_balance: number;
  credit_limit: number;
}

function genReceiptNo() {
  const now = new Date();
  const ym = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
  return `RCT-${ym}-${Math.floor(Math.random() * 900000 + 100000)}`;
}

export interface StatementLine { date: string; type: 'invoice' | 'payment'; reference: string; debit: number; credit: number; }

export async function fetchCustomerStatement(customerId: string): Promise<StatementLine[]> {
  const [{ data: sales }, { data: payments }] = await Promise.all([
    supabase.from('sales').select('created_at, invoice_no, total_amount').eq('customer_id', customerId).order('created_at', { ascending: true }),
    supabase.from('collections').select('created_at, receipt_no, amount').eq('customer_id', customerId).order('created_at', { ascending: true }),
  ]);
  const lines: StatementLine[] = [
    ...((sales ?? []) as any[]).map((s) => ({ date: s.created_at, type: 'invoice' as const, reference: s.invoice_no, debit: s.total_amount, credit: 0 })),
    ...((payments ?? []) as any[]).map((p) => ({ date: p.created_at, type: 'payment' as const, reference: p.receipt_no, debit: 0, credit: p.amount })),
  ];
  return lines.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export function useOutstandingCustomers() {
  const { company } = useAuth();
  const [customers, setCustomers] = useState<CustomerWithBalance[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data } = await supabase
      .from('customers')
      .select('id, business_name, customer_code, outstanding_balance, credit_limit')
      .eq('company_id', company.id)
      .gt('outstanding_balance', 0)
      .order('outstanding_balance', { ascending: false });
    setLoading(false);
    setCustomers((data ?? []) as CustomerWithBalance[]);
  }, [company]);

  useEffect(() => { load(); }, [load]);

  return { customers, loading, reload: load };
}

export function useCollections() {
  const { company, user } = useAuth();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data } = await supabase
      .from('collections')
      .select('*, customer:customers(id,business_name)')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false })
      .limit(200);
    setLoading(false);
    setCollections((data ?? []) as unknown as Collection[]);
  }, [company]);

  useEffect(() => { load(); }, [load]);

  const recordCollection = useCallback(async (params: {
    customerId: string; method: Collection['method']; amount: number;
    referenceNo?: string; chequeDate?: string; appliedToSaleId?: string | null; notes?: string;
  }) => {
    if (!company || !user) return { error: 'Missing context' };
    if (params.amount <= 0) return { error: 'Amount must be greater than zero' };

    const { data: row, error: insertErr } = await supabase
      .from('collections')
      .insert({
        company_id: company.id, receipt_no: genReceiptNo(), customer_id: params.customerId,
        collected_by: user.id, method: params.method, amount: params.amount,
        reference_no: params.referenceNo || null, cheque_date: params.chequeDate || null,
        applied_to_sale_id: params.appliedToSaleId || null, notes: params.notes || null,
      })
      .select('id')
      .single();
    if (insertErr || !row) return { error: insertErr?.message ?? 'Failed to record collection' };

    const { error: rpcErr } = await supabase.rpc('record_collection', { p_collection_id: row.id });
    if (rpcErr) return { error: rpcErr.message };

    await load();
    return { error: null };
  }, [company, user, load]);

  return { collections, loading, reload: load, recordCollection };
}

export interface OpenSale { id: string; invoice_no: string; balance_amount: number; }

export async function fetchOpenSalesForCustomer(customerId: string): Promise<OpenSale[]> {
  const { data } = await supabase
    .from('sales')
    .select('id, invoice_no, balance_amount')
    .eq('customer_id', customerId)
    .gt('balance_amount', 0)
    .order('created_at', { ascending: true });
  return (data ?? []) as OpenSale[];
}
