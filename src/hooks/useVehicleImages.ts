import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface VehicleImage {
  id: string;
  van_id: string;
  image_url: string;
  is_primary: boolean;
  created_at: string;
}

export function useVehicleImages(vanId: string | null) {
  const { company } = useAuth();
  const [images, setImages] = useState<VehicleImage[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!vanId || !company) { setImages([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase.from('vehicle_images').select('*').eq('van_id', vanId).order('is_primary', { ascending: false });
    setImages((data ?? []) as VehicleImage[]);
    setLoading(false);
  }, [vanId, company]);

  useEffect(() => { load(); }, [load]);

  const addImage = useCallback(async (imageUrl: string, isPrimary = false) => {
    if (!vanId || !company) return { error: 'No van selected' };
    if (isPrimary) await supabase.from('vehicle_images').update({ is_primary: false }).eq('van_id', vanId);
    const { error } = await supabase.from('vehicle_images').insert({
      company_id: company.id, van_id: vanId, image_url: imageUrl, is_primary: isPrimary,
    });
    if (error) return { error: error.message };
    await load();
    return { error: null };
  }, [vanId, company, load]);

  const removeImage = useCallback(async (id: string) => {
    const { error } = await supabase.from('vehicle_images').delete().eq('id', id);
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  return { images, loading, reload: load, addImage, removeImage };
}
