import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface CollectionType {
  id: string;
  code: string;
  label: string;
  customer_required: boolean;
  invoice_allocation_required: boolean;
  requires_approval: boolean;
  allowed_payment_method_codes: string[];
  reference_required: boolean;
  cheque_details_required: boolean;
  is_system: boolean;
  is_active: boolean;
}

export function useCollectionTypes() {
  const { company } = useAuth();
  const [collectionTypes, setCollectionTypes] = useState<CollectionType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!company) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('collection_types')
        .select('*')
        .or(`company_id.is.null,company_id.eq.${company.id}`)
        .eq('is_active', true)
        .order('is_system', { ascending: false });
      setCollectionTypes((data ?? []) as CollectionType[]);
      setLoading(false);
    })();
  }, [company]);

  return { collectionTypes, loading };
}
