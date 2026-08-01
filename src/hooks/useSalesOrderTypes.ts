import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface SalesOrderType {
  id: string;
  code: string;
  label: string;
  default_stock_source: 'van' | 'warehouse';
  default_payment_type: string | null;
  requires_approval: boolean;
  requires_credit_validation: boolean;
  reservation_rule: 'none' | 'soft' | 'hard';
  is_system: boolean;
  is_active: boolean;
}

export function useSalesOrderTypes() {
  const { company } = useAuth();
  const [orderTypes, setOrderTypes] = useState<SalesOrderType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!company) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('sales_order_types')
        .select('*')
        .or(`company_id.is.null,company_id.eq.${company.id}`)
        .eq('is_active', true)
        .order('is_system', { ascending: false });
      setOrderTypes((data ?? []) as SalesOrderType[]);
      setLoading(false);
    })();
  }, [company]);

  return { orderTypes, loading };
}
