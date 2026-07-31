import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface CustomerContact {
  id: string;
  customer_id: string;
  contact_name: string;
  department: string | null;
  designation: string | null;
  phone: string | null;
  mobile: string | null;
  whatsapp: string | null;
  email: string | null;
  preferred_contact: boolean;
  is_primary: boolean;
  is_authorized_buyer: boolean;
  is_authorized_receiver: boolean;
  is_authorized_payment_contact: boolean;
  status: 'active' | 'inactive';
  notes: string | null;
  created_at: string;
}

export type ContactInput = Partial<Omit<CustomerContact, 'id' | 'customer_id' | 'created_at'>> & { contact_name: string };

export function useCustomerContacts(customerId: string | null) {
  const { company } = useAuth();
  const [contacts, setContacts] = useState<CustomerContact[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company || !customerId) { setContacts([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase.from('customer_contacts').select('*').eq('customer_id', customerId).order('is_primary', { ascending: false });
    setContacts((data ?? []) as CustomerContact[]);
    setLoading(false);
  }, [company, customerId]);

  useEffect(() => { load(); }, [load]);

  const createContact = useCallback(async (input: ContactInput) => {
    if (!company || !customerId) return { error: 'Missing context' };
    const { error } = await supabase.from('customer_contacts').insert({ ...input, company_id: company.id, customer_id: customerId });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [company, customerId, load]);

  const updateContact = useCallback(async (id: string, patch: Partial<ContactInput>) => {
    const { error } = await supabase.from('customer_contacts').update(patch).eq('id', id);
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  const removeContact = useCallback(async (id: string) => {
    const { error } = await supabase.from('customer_contacts').delete().eq('id', id);
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  return { contacts, loading, reload: load, createContact, updateContact, removeContact };
}
