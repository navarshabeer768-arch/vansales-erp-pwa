import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface PaymentTerm {
  id: string; code: string; label: string; credit_days: number; grace_days: number;
  allowed_payment_method_codes: string[]; advance_payment_pct: number; late_payment_rule: string | null;
  description: string | null; is_system: boolean; is_active: boolean;
}

export function usePaymentTerms() {
  const { company } = useAuth();
  const [terms, setTerms] = useState<PaymentTerm[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data } = await supabase.from('payment_terms').select('*')
      .or(`company_id.is.null,company_id.eq.${company.id}`).eq('is_active', true).order('credit_days');
    setTerms((data ?? []) as PaymentTerm[]);
    setLoading(false);
  }, [company]);

  useEffect(() => { load(); }, [load]);

  const create = useCallback(async (input: { code: string; label: string; creditDays: number; graceDays: number; description?: string }) => {
    if (!company) return { error: 'No company context' };
    const { error } = await supabase.from('payment_terms').insert({
      code: input.code, company_id: company.id, label: input.label,
      credit_days: input.creditDays, grace_days: input.graceDays, description: input.description || null,
    });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [company, load]);

  const deactivate = useCallback(async (id: string) => {
    const { error } = await supabase.from('payment_terms').update({ is_active: false }).eq('id', id);
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  return { terms, loading, create, deactivate, reload: load };
}

export interface PaymentMethod { id: string; code: string; label: string; is_system: boolean; is_active: boolean; }

export function usePaymentMethods() {
  const { company } = useAuth();
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data } = await supabase.from('payment_methods').select('id, code, label, is_system, is_active')
      .or(`company_id.is.null,company_id.eq.${company.id}`).eq('is_active', true).order('is_system', { ascending: false });
    setMethods((data ?? []) as PaymentMethod[]);
    setLoading(false);
  }, [company]);

  useEffect(() => { load(); }, [load]);

  const addCustom = useCallback(async (code: string, label: string) => {
    if (!company) return { error: 'No company context' };
    const { error } = await supabase.from('payment_methods').insert({ code, company_id: company.id, label, is_system: false });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [company, load]);

  const deactivate = useCallback(async (id: string) => {
    const { error } = await supabase.from('payment_methods').update({ is_active: false }).eq('id', id);
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  return { methods, loading, addCustom, deactivate, reload: load };
}

export interface RiskLevel { id: string; code: string; label: string; severity: number; is_system: boolean; is_active: boolean; }

export function useRiskLevels() {
  const { company } = useAuth();
  const [levels, setLevels] = useState<RiskLevel[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data } = await supabase.from('customer_risk_levels').select('*')
      .or(`company_id.is.null,company_id.eq.${company.id}`).eq('is_active', true).order('severity');
    setLevels((data ?? []) as RiskLevel[]);
    setLoading(false);
  }, [company]);

  useEffect(() => { load(); }, [load]);

  const addCustom = useCallback(async (code: string, label: string, severity: number) => {
    if (!company) return { error: 'No company context' };
    const { error } = await supabase.from('customer_risk_levels').insert({ code, company_id: company.id, label, severity, is_system: false });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [company, load]);

  const deactivate = useCallback(async (id: string) => {
    const { error } = await supabase.from('customer_risk_levels').update({ is_active: false }).eq('id', id);
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  return { levels, loading, addCustom, deactivate, reload: load };
}
