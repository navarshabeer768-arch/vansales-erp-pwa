import { useState } from 'react';
import { Radar, Navigation, ExternalLink, CircleDot } from 'lucide-react';
import { useVanPositions, useShareLocation } from '@/hooks/useGpsTracking';
import { useMyVanContext } from '@/hooks/useVanAssignments';
import { useToast } from '@/contexts/ToastContext';

function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function isLive(iso: string | null): boolean {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() < 120000; // 2 minutes
}

export function GpsTrackingPage() {
  const { vans, loading } = useVanPositions();
  const { defaultVanId } = useMyVanContext();
  const { push } = useToast();

  const [selectedVanId] = useState<string | null>(null);
  const activeVanId = selectedVanId ?? defaultVanId;
  const canShare = activeVanId !== null;
  const { sharing, error, start, stop } = useShareLocation(activeVanId);

  const handleToggleSharing = () => {
    if (sharing) { stop(); push('info', 'Stopped sharing location.'); return; }
    if (!activeVanId) { push('error', 'No single van assigned to you to share location for.'); return; }
    start();
    push('success', 'Sharing your location — this updates while this tab stays open.');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">GPS Tracking</h1>
          <p className="text-sm text-slate-500">Live van positions. Auto-refreshes every 20 seconds.</p>
        </div>
        {canShare && (
          <button className={sharing ? 'btn-danger' : 'btn-primary'} onClick={handleToggleSharing}>
            <Navigation size={16} /> {sharing ? 'Stop sharing my location' : 'Share my location'}
          </button>
        )}
      </div>

      {error && (
        <div className="card border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <p className="py-10 text-center text-slate-400">Loading…</p>
      ) : vans.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 p-10 text-center">
          <Radar className="text-slate-300" size={36} />
          <p className="font-medium text-slate-600 dark:text-slate-300">No vans yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {vans.map((v) => {
            const live = isLive(v.last_location_at);
            const hasPosition = v.current_latitude != null && v.current_longitude != null;
            return (
              <div key={v.id} className="card space-y-3 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-800 dark:text-slate-100">{v.name}</p>
                    <p className="text-xs text-slate-500">{v.code}</p>
                  </div>
                  {live && (
                    <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
                      <CircleDot size={12} className="animate-pulse" /> Live
                    </span>
                  )}
                </div>
                <div className="text-sm text-slate-500">
                  {v.staff.length === 0 ? (
                    <p>No staff currently assigned</p>
                  ) : (
                    v.staff.map((s, i) => <p key={i}>{s.full_name} <span className="capitalize text-slate-400">({s.role_code.replace('_', ' ')})</span></p>)
                  )}
                </div>
                <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-sm dark:border-slate-800">
                  <span className="text-slate-500">Updated {timeAgo(v.last_location_at)}</span>
                  {hasPosition ? (
                    <a
                      href={`https://www.google.com/maps?q=${v.current_latitude},${v.current_longitude}`}
                      target="_blank" rel="noreferrer"
                      className="flex items-center gap-1 text-brand-700 hover:underline dark:text-brand-400"
                    >
                      View on map <ExternalLink size={12} />
                    </a>
                  ) : (
                    <span className="text-slate-400">No position yet</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
