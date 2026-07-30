import { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Play, Pause, MapPin } from 'lucide-react';
import { useVans } from '@/hooks/useVans';
import { useVanGpsStats, fetchGpsHistory, GpsPoint } from '@/hooks/useGeofences';

function todayIso() { return new Date().toISOString().slice(0, 10); }

export function GpsHistoryPage() {
  const { vans } = useVans();
  const [vanId, setVanId] = useState('');
  const [date, setDate] = useState(todayIso());
  const [points, setPoints] = useState<GpsPoint[]>([]);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);

  const { stats } = useVanGpsStats(vanId || null, date);

  const mapRef = useRef<L.Map | null>(null);
  const mapDivRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);

  useEffect(() => {
    if (!vanId) { setPoints([]); return; }
    fetchGpsHistory(vanId, date).then(setPoints);
    setCursor(0);
    setPlaying(false);
  }, [vanId, date]);

  // Initialize the map once.
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;
    const map = L.map(mapDivRef.current).setView([25.276987, 51.520008], 12); // Doha default; recentres once real points load
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Redraw the route whenever points change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (polylineRef.current) { polylineRef.current.remove(); polylineRef.current = null; }
    if (markerRef.current) { markerRef.current.remove(); markerRef.current = null; }
    if (points.length === 0) return;

    const latLngs: L.LatLngExpression[] = points.map((p) => [p.latitude, p.longitude]);
    polylineRef.current = L.polyline(latLngs, { color: '#1D4ED8', weight: 4 }).addTo(map);
    markerRef.current = L.marker(latLngs[0]).addTo(map);
    map.fitBounds(polylineRef.current.getBounds(), { padding: [30, 30] });
  }, [points]);

  // Move the marker as the cursor advances.
  useEffect(() => {
    if (!markerRef.current || points.length === 0) return;
    const p = points[cursor];
    if (p) markerRef.current.setLatLng([p.latitude, p.longitude]);
  }, [cursor, points]);

  // Playback loop.
  useEffect(() => {
    if (!playing) return;
    if (cursor >= points.length - 1) { setPlaying(false); return; }
    const t = setTimeout(() => setCursor((c) => Math.min(c + 1, points.length - 1)), 200);
    return () => clearTimeout(t);
  }, [playing, cursor, points.length]);

  const currentPoint = points[cursor];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">GPS History &amp; Route Playback</h1>
        <p className="text-sm text-slate-500">Pick a van and date to see the recorded route, play it back, and view trip stats.</p>
      </div>

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="label">Van</label>
          <select className="input" value={vanId} onChange={(e) => setVanId(e.target.value)}>
            <option value="">Select a van…</option>
            {vans.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Date</label>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="card p-3"><p className="text-xs text-slate-500">Distance</p><p className="text-lg font-bold">{stats.distance_km} km</p></div>
          <div className="card p-3"><p className="text-xs text-slate-500">Travel time</p><p className="text-lg font-bold">{stats.travel_minutes} min</p></div>
          <div className="card p-3"><p className="text-xs text-slate-500">Stop time</p><p className="text-lg font-bold">{stats.stop_minutes} min</p></div>
          <div className="card p-3"><p className="text-xs text-slate-500">GPS points</p><p className="text-lg font-bold">{stats.point_count}</p></div>
        </div>
      )}

      <div className="card overflow-hidden">
        <div ref={mapDivRef} style={{ height: '420px', width: '100%' }} />
      </div>

      {points.length > 0 && (
        <div className="card space-y-3 p-4">
          <div className="flex items-center gap-3">
            <button className="btn-primary !px-3 !py-2" onClick={() => setPlaying((p) => !p)}>
              {playing ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <input
              type="range" min={0} max={points.length - 1} value={cursor}
              onChange={(e) => { setPlaying(false); setCursor(Number(e.target.value)); }}
              className="flex-1"
            />
            <span className="w-40 shrink-0 text-right text-sm text-slate-500">
              {currentPoint ? new Date(currentPoint.recorded_at).toLocaleTimeString() : '—'}
            </span>
          </div>
          {currentPoint && (
            <p className="flex items-center gap-1 text-xs text-slate-500">
              <MapPin size={12} /> {currentPoint.latitude.toFixed(5)}, {currentPoint.longitude.toFixed(5)}
              {currentPoint.speed_kmh != null && ` · ${currentPoint.speed_kmh.toFixed(0)} km/h`}
            </p>
          )}
        </div>
      )}

      {vanId && points.length === 0 && (
        <div className="card p-10 text-center text-sm text-slate-400">No GPS points recorded for this van on this date.</div>
      )}
    </div>
  );
}
