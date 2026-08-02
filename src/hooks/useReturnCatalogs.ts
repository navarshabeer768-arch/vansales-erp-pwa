import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface ReturnType {
  id: string; code: string; label: string; invoice_required: boolean; requires_approval: boolean;
  batch_required: boolean; serial_required: boolean; inspection_required: boolean; stock_destination: string;
  replacement_eligible: boolean; is_active: boolean;
}
export interface ReturnReason {
  id: string; code: string; label: string; requires_approval: boolean; stock_destination: string | null;
  requires_notes: boolean; is_active: boolean;
}
export interface ReturnCondition {
  id: string; code: string; label: string; default_stock_destination: string; is_active: boolean;
}

export function useReturnCatalogs() {
  const { company } = useAuth();
  const [returnTypes, setReturnTypes] = useState<ReturnType[]>([]);
  const [returnReasons, setReturnReasons] = useState<ReturnReason[]>([]);
  const [returnConditions, setReturnConditions] = useState<ReturnCondition[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!company) return;
    (async () => {
      setLoading(true);
      const [{ data: types }, { data: reasons }, { data: conditions }] = await Promise.all([
        supabase.from('sales_return_types').select('*').or(`company_id.is.null,company_id.eq.${company.id}`).eq('is_active', true).order('is_system', { ascending: false }),
        supabase.from('sales_return_reasons').select('*').or(`company_id.is.null,company_id.eq.${company.id}`).eq('is_active', true),
        supabase.from('sales_return_conditions').select('*').or(`company_id.is.null,company_id.eq.${company.id}`).eq('is_active', true),
      ]);
      setReturnTypes((types ?? []) as ReturnType[]);
      setReturnReasons((reasons ?? []) as ReturnReason[]);
      setReturnConditions((conditions ?? []) as ReturnCondition[]);
      setLoading(false);
    })();
  }, [company]);

  return { returnTypes, returnReasons, returnConditions, loading };
}
