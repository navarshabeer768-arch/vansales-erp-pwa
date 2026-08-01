import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface LookupOption { id: string; label: string; }

// Reuses existing warehouses (=branches), territories, routes, vans — no new lookup tables.
export function useBeatPlanLookups() {
  const { company } = useAuth();
  const [branches, setBranches] = useState<LookupOption[]>([]);
  const [territories, setTerritories] = useState<LookupOption[]>([]);
  const [routes, setRoutes] = useState<LookupOption[]>([]);
  const [vans, setVans] = useState<LookupOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!company) return;
    (async () => {
      setLoading(true);
      const [b, t, r, v] = await Promise.all([
        supabase.from('warehouses').select('id, name').eq('company_id', company.id).order('name'),
        supabase.from('territories').select('id, name').eq('company_id', company.id).order('name'),
        supabase.from('routes').select('id, name, code').eq('company_id', company.id).eq('is_active', true).order('name'),
        supabase.from('vans').select('id, code, name').eq('company_id', company.id).order('name'),
      ]);
      setBranches((b.data ?? []).map((x: any) => ({ id: x.id, label: x.name })));
      setTerritories((t.data ?? []).map((x: any) => ({ id: x.id, label: x.name })));
      setRoutes((r.data ?? []).map((x: any) => ({ id: x.id, label: `${x.code} — ${x.name}` })));
      setVans((v.data ?? []).map((x: any) => ({ id: x.id, label: `${x.code} — ${x.name}` })));
      setLoading(false);
    })();
  }, [company]);

  return { branches, territories, routes, vans, loading };
}
