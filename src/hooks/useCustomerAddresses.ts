import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export type AddressType = 'billing' | 'delivery' | 'office' | 'warehouse' | 'shop' | 'branch' | 'custom';

export interface CustomerAddress {
  id: string;
  customer_id: string;
  address_type: AddressType;
  custom_type_label: string | null;
  address_name: string | null;
  building: string | null;
  street: string | null;
  area: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postal_code: string | null;
  google_maps_url: string | null;
  latitude: number | null;
  longitude: number | null;
  delivery_instructions: string | null;
  contact_person: string | null;
  phone_number: string | null;
  is_default_billing: boolean;
  is_default_delivery: boolean;
  status: 'active' | 'inactive';
  is_current: boolean;
  superseded_at: string | null;
  created_at: string;
}

export type AddressInput = Partial<Omit<CustomerAddress, 'id' | 'customer_id' | 'is_current' | 'superseded_at' | 'created_at'>>;

export function useCustomerAddresses(customerId: string | null) {
  const { company } = useAuth();
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [history, setHistory] = useState<CustomerAddress[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company || !customerId) { setAddresses([]); setHistory([]); setLoading(false); return; }
    setLoading(true);
    const [{ data: current }, { data: all }] = await Promise.all([
      supabase.from('customer_addresses').select('*').eq('customer_id', customerId).eq('is_current', true).order('created_at', { ascending: false }),
      supabase.from('customer_addresses').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }),
    ]);
    setAddresses((current ?? []) as CustomerAddress[]);
    setHistory((all ?? []) as CustomerAddress[]);
    setLoading(false);
  }, [company, customerId]);

  useEffect(() => { load(); }, [load]);

  const createAddress = useCallback(async (input: AddressInput) => {
    if (!company || !customerId) return { error: 'Missing context' };
    const { error } = await supabase.from('customer_addresses').insert({ ...input, company_id: company.id, customer_id: customerId });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [company, customerId, load]);

  /** Never overwrites — supersedes the old row and inserts a new current version. */
  const replaceAddress = useCallback(async (addressId: string, patch: AddressInput) => {
    const { error } = await supabase.rpc('replace_customer_address', { p_old_address_id: addressId, p_new_fields: patch });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  const deactivate = useCallback(async (addressId: string) => {
    const { error } = await supabase.from('customer_addresses').update({ status: 'inactive' }).eq('id', addressId);
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  return { addresses, history, loading, reload: load, createAddress, replaceAddress, deactivate };
}
