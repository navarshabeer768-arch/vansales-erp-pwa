import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { offlineDb } from '@/lib/offlineDb';
import { getDeviceId } from '@/lib/deviceId';

export interface SyncQueueSummary {
  entityType: 'sale' | 'collection' | 'return';
  clientUuid: string;
  createdAt: string;
  lastError: string | null;
}

async function findDeviceId(companyId: string): Promise<string | null> {
  const { data } = await supabase.from('devices').select('id').eq('company_id', companyId).eq('device_uid', getDeviceId()).maybeSingle();
  return data?.id ?? null;
}

export function useOfflineSyncManager() {
  const { company, user } = useAuth();
  const [pending, setPending] = useState<SyncQueueSummary[]>([]);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    const [sales, collections, returns] = await Promise.all([
      offlineDb.pendingSales.toArray(), offlineDb.pendingCollections.toArray(), offlineDb.pendingReturns.toArray(),
    ]);
    setPending([
      ...sales.map((s) => ({ entityType: 'sale' as const, clientUuid: s.client_uuid, createdAt: s.created_at, lastError: s.last_error })),
      ...collections.map((c) => ({ entityType: 'collection' as const, clientUuid: c.client_uuid, createdAt: c.created_at, lastError: c.last_error })),
      ...returns.map((r) => ({ entityType: 'return' as const, clientUuid: r.client_uuid, createdAt: r.created_at, lastError: r.last_error })),
    ]);
  }, []);

  const flush = useCallback(async () => {
    if (!navigator.onLine || !company) return;
    setSyncing(true);
    let synced = 0;
    let failed = 0;

    const sales = await offlineDb.pendingSales.toArray();
    for (const item of sales) {
      const { error } = await supabase.rpc('create_sale', item.payload);
      if (!error) { await offlineDb.pendingSales.delete(item.client_uuid); synced++; }
      else { await offlineDb.pendingSales.update(item.client_uuid, { last_error: error.message }); failed++; }
    }

    const collections = await offlineDb.pendingCollections.toArray();
    for (const item of collections) {
      const { error } = await supabase.rpc('create_collection_offline', item.payload);
      if (!error) { await offlineDb.pendingCollections.delete(item.client_uuid); synced++; }
      else { await offlineDb.pendingCollections.update(item.client_uuid, { last_error: error.message }); failed++; }
    }

    const returns = await offlineDb.pendingReturns.toArray();
    for (const item of returns) {
      const { error } = await supabase.rpc('create_return_offline', item.payload);
      if (!error) { await offlineDb.pendingReturns.delete(item.client_uuid); synced++; }
      else { await offlineDb.pendingReturns.update(item.client_uuid, { last_error: error.message }); failed++; }
    }

    if (synced > 0 || failed > 0) {
      const deviceId = await findDeviceId(company.id);
      await supabase.from('sync_history').insert({
        company_id: company.id, device_id: deviceId, employee_id: user?.id ?? null,
        entity_type: 'sales,collections,returns', records_synced: synced, records_failed: failed,
        status: failed === 0 ? 'success' : synced > 0 ? 'partial' : 'failed', completed_at: new Date().toISOString(),
      });
      if (deviceId) await supabase.rpc('touch_device_sync', { p_device_uid: getDeviceId() });
    }

    await refresh();
    setSyncing(false);
  }, [company, user, refresh]);

  useEffect(() => {
    refresh();
    flush();
    window.addEventListener('online', flush);
    return () => window.removeEventListener('online', flush);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { pending, pendingCount: pending.length, syncing, flush, refresh };
}
