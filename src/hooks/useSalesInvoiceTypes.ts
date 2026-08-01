import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface SalesInvoiceType {
  id: string;
  code: string;
  label: string;
  default_stock_source: 'van' | 'warehouse';
  default_payment_type: string | null;
  order_requirement: 'required' | 'optional' | 'not_allowed';
  customer_requirement: 'required' | 'optional';
  requires_approval: boolean;
  requires_credit_validation: boolean;
  is_tax_invoice: boolean;
  is_system: boolean;
  is_active: boolean;
}

export function useSalesInvoiceTypes() {
  const { company } = useAuth();
  const [invoiceTypes, setInvoiceTypes] = useState<SalesInvoiceType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!company) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('sales_invoice_types')
        .select('*')
        .or(`company_id.is.null,company_id.eq.${company.id}`)
        .eq('is_active', true)
        .order('is_system', { ascending: false });
      setInvoiceTypes((data ?? []) as SalesInvoiceType[]);
      setLoading(false);
    })();
  }, [company]);

  return { invoiceTypes, loading };
}
