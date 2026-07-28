import { useCallback, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface CompanyProfileInput {
  name: string;
  legal_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  currency: string;
  tax_number: string | null;
  tax_rate: number;
}

export function useCompanyProfile() {
  const { company, refresh } = useAuth();
  const [saving, setSaving] = useState(false);

  const updateProfile = useCallback(async (input: CompanyProfileInput) => {
    if (!company) return { error: 'No company context' };
    setSaving(true);
    const { error } = await supabase.from('companies').update(input).eq('id', company.id);
    setSaving(false);
    if (!error) await refresh(); // AuthContext caches `company` — refresh so the rest of the app sees the change
    return { error: error?.message ?? null };
  }, [company, refresh]);

  return { company, saving, updateProfile };
}
