import { useState, useEffect } from 'react';
import { RefreshCw, WifiOff, Wifi, AlertTriangle } from 'lucide-react';
import { useOfflineSyncManager } from '@/hooks/useOfflineSyncManager';
import { useToast } from '@/contexts/ToastContext';
import { Link } from 'react-router-dom';

const ENTITY_LABELS: Record<string, string> = { sale: 'Sale', collection: 'Collection', return: 'Return' };

export function SyncManagementPage() {
  const { pending, pendingCount, syncing, flush } = useOfflineSyncManager();
  const { push } = useToast();
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);

  const handleManualSync = async () => {
    if (!online) { push('error', 'No connection — nothing to sync right now. It will sync automatically once you\'re back online.'); return; }
    await flush();
    push('success', 'Sync complete.');
  };

  const failedItems = pending.filter((p) => p.lastError);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Sync Management</h1>
          <p className="text-sm text-slate-500">Sales, Collections, and Returns queue locally on this device when offline, then sync automatically the moment you're back online.</p>
        </div>
        <button className="btn-primary" onClick={handleManualSync} disabled={syncing || !online}>
          <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} /> {syncing ? 'Syncing…' : 'Sync now'}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card p-4">
          <p className="flex items-center gap-2 text-sm text-slate-500">{online ? <Wifi size={14} className="text-emerald-600" /> : <WifiOff size={14} className="text-red-600" />} Connection</p>
          <p className="mt-1 text-lg font-bold">{online ? 'Online' : 'Offline'}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-slate-500">Pending items</p>
          <p className="mt-1 text-lg font-bold">{pendingCount}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-slate-500">Failed (will retry)</p>
          <p className={`mt-1 text-lg font-bold ${failedItems.length > 0 ? 'text-red-600' : ''}`}>{failedItems.length}</p>
        </div>
      </div>

      {pending.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 p-10 text-center">
          <Wifi className="text-slate-300" size={36} />
          <p className="text-sm text-slate-500">Nothing queued — everything is synced.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="table-base">
            <thead><tr><th>Type</th><th>Queued at</th><th>Status</th></tr></thead>
            <tbody>
              {pending.map((p) => (
                <tr key={p.clientUuid}>
                  <td>{ENTITY_LABELS[p.entityType]}</td>
                  <td>{new Date(p.createdAt).toLocaleString()}</td>
                  <td>
                    {p.lastError ? (
                      <span className="flex items-center gap-1 text-red-600"><AlertTriangle size={12} /> {p.lastError}</span>
                    ) : (
                      <span className="badge-amber">Pending sync</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-sm text-slate-500">
        Full history of past syncs is in <Link to="/settings/device-reports" className="text-brand-700 hover:underline dark:text-brand-400">Device &amp; Sync Reports → Sync Report</Link>.
      </p>
    </div>
  );
}
