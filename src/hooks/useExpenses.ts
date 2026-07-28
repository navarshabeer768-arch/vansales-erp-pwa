import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface Expense {
  id: string;
  expense_no: string;
  category: string;
  amount: number;
  paid_via: 'cash' | 'bank';
  notes: string | null;
  created_at: string;
}

function genExpenseNo() {
  const now = new Date();
  const ym = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
  return `EXP-${ym}-${Math.floor(Math.random() * 900000 + 100000)}`;
}

export function useExpenses() {
  const { company, user } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data } = await supabase
      .from('expenses')
      .select('*')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false })
      .limit(200);
    setLoading(false);
    setExpenses((data ?? []) as Expense[]);
  }, [company]);

  useEffect(() => { load(); }, [load]);

  const createExpense = useCallback(async (params: { category: string; amount: number; paidVia: 'cash' | 'bank'; notes?: string }) => {
    if (!company || !user) return { error: 'Missing context' };
    if (params.amount <= 0) return { error: 'Amount must be greater than zero.' };
    const { error } = await supabase.from('expenses').insert({
      company_id: company.id, expense_no: genExpenseNo(), category: params.category,
      amount: params.amount, paid_via: params.paidVia, notes: params.notes || null, created_by: user.id,
    });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [company, user, load]);

  return { expenses, loading, reload: load, createExpense };
}
