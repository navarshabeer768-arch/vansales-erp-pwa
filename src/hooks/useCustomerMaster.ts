import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export type CustomerStatus = 'draft' | 'pending_approval' | 'active' | 'inactive' | 'blocked' | 'suspended' | 'archived' | 'deleted';

export interface CustomerMaster {
  id: string;
  customer_code: string;
  business_name: string;
  arabic_name: string | null;
  display_name: string | null;
  customer_type_id: string | null;
  category_id: string | null;
  channel_id: string | null;
  group_id: string | null;
  territory_id: string | null;
  area: string | null;
  route_id: string | null;
  van_id: string | null;
  branch_id: string | null;
  assigned_employee_id: string | null;
  status: CustomerStatus;
  credit_limit: number;
  outstanding_balance: number;
  price_level: string;
  tax_number: string | null;
  commercial_registration: string | null;
  business_license: string | null;
  email: string | null;
  website: string | null;
  primary_phone: string | null;
  secondary_phone: string | null;
  whatsapp: string | null;
  preferred_language: string | null;
  preferred_contact_method: string | null;
  latitude: number | null;
  longitude: number | null;
  google_maps_url: string | null;
  opening_date: string | null;
  notes: string | null;
  internal_remarks: string | null;
  manual_code_used: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  customer_type?: { id: string; label: string } | null;
  category?: { id: string; label: string } | null;
  channel?: { id: string; label: string } | null;
  group?: { id: string; name: string } | null;
  territory?: { id: string; name: string } | null;
  route?: { id: string; name: string } | null;
  van?: { id: string; name: string } | null;
  branch?: { id: string; name: string } | null;
  assigned_employee?: { id: string; full_name: string } | null;
  tags?: { tag_id: string; customer_tags: { id: string; name: string } }[];
}

const SELECT = `
  *,
  customer_type:customer_types(id,label), category:customer_categories(id,label), channel:customer_channels(id,label),
  group:customer_groups(id,name), territory:territories(id,name), route:routes(id,name), van:vans(id,name),
  branch:warehouses(id,name), assigned_employee:app_users(id,full_name),
  tags:customer_tag_assignments(tag_id, customer_tags(id,name))
`;

export interface CustomerFilters {
  status?: CustomerStatus; territoryId?: string; routeId?: string; vanId?: string; employeeId?: string;
  typeId?: string; groupId?: string; categoryId?: string; channelId?: string;
}

export function useCustomerMaster(filters: CustomerFilters = {}) {
  const { company, user } = useAuth();
  const [customers, setCustomers] = useState<CustomerMaster[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    let query = supabase.from('customers').select(SELECT).eq('company_id', company.id);
    if (filters.status) query = query.eq('status', filters.status);
    else query = query.neq('status', 'deleted');
    if (filters.territoryId) query = query.eq('territory_id', filters.territoryId);
    if (filters.routeId) query = query.eq('route_id', filters.routeId);
    if (filters.vanId) query = query.eq('van_id', filters.vanId);
    if (filters.employeeId) query = query.eq('assigned_employee_id', filters.employeeId);
    if (filters.typeId) query = query.eq('customer_type_id', filters.typeId);
    if (filters.groupId) query = query.eq('group_id', filters.groupId);
    if (filters.categoryId) query = query.eq('category_id', filters.categoryId);
    if (filters.channelId) query = query.eq('channel_id', filters.channelId);
    const { data } = await query.order('business_name', { ascending: true });
    setCustomers((data ?? []) as unknown as CustomerMaster[]);
    setLoading(false);
  }, [company, JSON.stringify(filters)]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  const checkDuplicates = useCallback(async (phone: string | null, whatsapp: string | null, email: string | null, excludeId?: string) => {
    const { data } = await supabase.rpc('check_duplicate_customer', {
      p_phone: phone || null, p_whatsapp: whatsapp || null, p_email: email || null, p_exclude_id: excludeId || null,
    });
    return (data ?? []) as { id: string; business_name: string; matched_on: string }[];
  }, []);

  const generateCode = useCallback(async () => {
    if (!company) return '';
    const { data } = await supabase.rpc('generate_customer_code', { p_company_id: company.id });
    return (data as string) ?? '';
  }, [company]);

  const createCustomer = useCallback(async (input: Partial<CustomerMaster> & { business_name: string; customer_code: string }) => {
    if (!company || !user) return { error: 'Missing context', id: null };
    const { data, error } = await supabase
      .from('customers')
      .insert({ ...input, company_id: company.id, created_by: user.id, updated_by: user.id })
      .select('id')
      .single();
    if (error) return { error: error.message, id: null };
    await load();
    return { error: null, id: data.id as string };
  }, [company, user, load]);

  const updateCustomer = useCallback(async (id: string, patch: Partial<CustomerMaster>) => {
    if (!user) return { error: 'No user context' };
    const { error } = await supabase.from('customers').update({ ...patch, updated_by: user.id }).eq('id', id);
    if (error) return { error: error.message };
    await load();
    return { error: null };
  }, [user, load]);

  const changeStatus = useCallback(async (id: string, newStatus: CustomerStatus, reason?: string) => {
    const { error } = await supabase.rpc('change_customer_status', { p_customer_id: id, p_new_status: newStatus, p_reason: reason || null });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  const setTags = useCallback(async (customerId: string, tagIds: string[]) => {
    await supabase.from('customer_tag_assignments').delete().eq('customer_id', customerId);
    if (tagIds.length > 0) {
      await supabase.from('customer_tag_assignments').insert(tagIds.map((tagId) => ({ customer_id: customerId, tag_id: tagId })));
    }
    await load();
  }, [load]);

  const reassign = useCallback(async (customerId: string, field: 'route_id' | 'van_id' | 'territory_id' | 'branch_id', value: string | null) => {
    const { error } = await supabase.rpc('reassign_customer', { p_customer_id: customerId, p_field_name: field, p_new_value: value });
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  // Bulk actions
  const bulkUpdate = useCallback(async (ids: string[], patch: Partial<CustomerMaster>) => {
    if (!user) return { error: 'No user context' };
    const { error } = await supabase.from('customers').update({ ...patch, updated_by: user.id }).in('id', ids);
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [user, load]);

  return {
    customers, loading, reload: load, createCustomer, updateCustomer, changeStatus,
    setTags, reassign, bulkUpdate, checkDuplicates, generateCode,
  };
}
