import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface WarehouseLocation {
  id: string;
  warehouse_id: string;
  zone: string;
  rack: string | null;
  shelf: string | null;
  bin: string | null;
  code: string;
  is_active: boolean;
  created_at: string;
  warehouse?: { id: string; name: string } | null;
}

export function useWarehouseLocations(warehouseId: string | null) {
  const { company } = useAuth();
  const [locations, setLocations] = useState<WarehouseLocation[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    let query = supabase.from('warehouse_locations').select('*, warehouse:warehouses(id,name)').eq('company_id', company.id);
    if (warehouseId) query = query.eq('warehouse_id', warehouseId);
    const { data } = await query.order('zone');
    setLocations((data ?? []) as unknown as WarehouseLocation[]);
    setLoading(false);
  }, [company, warehouseId]);

  useEffect(() => { load(); }, [load]);

  const createLocation = useCallback(async (params: { warehouseId: string; zone: string; rack?: string; shelf?: string; bin?: string }) => {
    if (!company) return { error: 'No company context' };
    const { error } = await supabase.from('warehouse_locations').insert({
      company_id: company.id, warehouse_id: params.warehouseId, zone: params.zone,
      rack: params.rack || null, shelf: params.shelf || null, bin: params.bin || null,
    });
    if (error) return { error: error.code === '23505' ? 'This exact zone/rack/shelf/bin already exists for that warehouse.' : error.message };
    await load();
    return { error: null };
  }, [company, load]);

  const deactivateLocation = useCallback(async (id: string) => {
    const { error } = await supabase.from('warehouse_locations').update({ is_active: false }).eq('id', id);
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  return { locations, loading, reload: load, createLocation, deactivateLocation };
}

/** Assign (or clear) a location for a specific warehouse_stock row. */
export async function assignStockLocation(warehouseStockId: string, locationId: string | null) {
  const { error } = await supabase.from('warehouse_stock').update({ location_id: locationId }).eq('id', warehouseStockId);
  return { error: error?.message ?? null };
}
