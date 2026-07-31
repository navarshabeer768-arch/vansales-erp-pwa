import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface RecentProduct { product_id: string; viewed_at: string; product: { id: string; name: string; sku: string } | null; }
export interface FavouriteProduct { product_id: string; product: { id: string; name: string; sku: string } | null; }

export function useRecentAndFavouriteProducts() {
  const { user } = useAuth();
  const [recent, setRecent] = useState<RecentProduct[]>([]);
  const [favourites, setFavourites] = useState<FavouriteProduct[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [{ data: recentData }, { data: favData }] = await Promise.all([
      supabase.from('product_recent_views').select('product_id, viewed_at, product:products(id,name,sku)')
        .eq('employee_id', user.id).order('viewed_at', { ascending: false }).limit(12),
      supabase.from('product_favourites').select('product_id, product:products(id,name,sku)').eq('employee_id', user.id),
    ]);
    setRecent((recentData ?? []) as unknown as RecentProduct[]);
    setFavourites((favData ?? []) as unknown as FavouriteProduct[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const recordView = useCallback(async (productId: string) => {
    await supabase.rpc('record_product_view', { p_product_id: productId });
  }, []);

  const toggleFavourite = useCallback(async (productId: string) => {
    if (!user) return;
    const isFav = favourites.some((f) => f.product_id === productId);
    if (isFav) await supabase.from('product_favourites').delete().eq('employee_id', user.id).eq('product_id', productId);
    else await supabase.from('product_favourites').insert({ employee_id: user.id, product_id: productId });
    await load();
  }, [user, favourites, load]);

  return { recent, favourites, loading, recordView, toggleFavourite, isFavourite: (id: string) => favourites.some((f) => f.product_id === id) };
}
