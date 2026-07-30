import { useState } from 'react';
import { Plus, MapPinned, Ban, Navigation2 } from 'lucide-react';
import { useGeofences, useGeofenceEvents, FenceType } from '@/hooks/useGeofences';
import { useWarehouses } from '@/hooks/useWarehouses';
import { useCustomers } from '@/hooks/useCustomers';
import { useRoutes } from '@/hooks/useRoutes';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';
import type { Geofence, GeofenceEvent } from '@/hooks/useGeofences';

const FENCE_TYPES: FenceType[] = ['warehouse', 'customer', 'route', 'custom'];

function NewFenceModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { createFence } = useGeofences();
  const { warehouses } = useWarehouses();
  const { customers } = useCustomers();
  const { routes } = useRoutes();
  const { push } = useToast();

  const [name, setName] = useState('');
  const [fenceType, setFenceType] = useState<FenceType>('warehouse');
  const [linkedId, setLinkedId] = useState('');
  const [lat, setLat] = useState<number | ''>('');
  const [lng, setLng] = useState<number | ''>('');
  const [radius, setRadius] = useState(200);
  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);

  const reset = () => { setName(''); setLinkedId(''); setLat(''); setLng(''); setRadius(200); };

  const useMyLocation = () => {
    if (!navigator.geolocation) { push('error', 'Location isn\'t available on this device/browser.'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLat(pos.coords.latitude); setLng(pos.coords.longitude); setLocating(false); },
      () => { push('error', 'Location access was denied.'); setLocating(false); },
      { enableHighAccuracy: true }
    );
  };

  const submit = async () => {
    if (!name.trim() || lat === '' || lng === '') { push('error', 'Enter a name and a center latitude/longitude.'); return; }
    setSubmitting(true);
    const { error } = await createFence({
      name: name.trim(), fenceType, centerLat: lat, centerLng: lng, radiusMeters: radius,
      warehouseId: fenceType === 'warehouse' ? linkedId : undefined,
      customerId: fenceType === 'customer' ? linkedId : undefined,
      routeId: fenceType === 'route' ? linkedId : undefined,
    });
    setSubmitting(false);
    if (error) { push('error', error); return; }
    push('success', 'Geofence created.');
    reset();
    onCreated();
    onClose();
  };

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title="New geofence" size="sm">
      <div className="space-y-4">
        <div>
          <label className="label">Name *</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Main Warehouse" />
        </div>
        <div>
          <label className="label">Type</label>
          <select className="input" value={fenceType} onChange={(e) => { setFenceType(e.target.value as FenceType); setLinkedId(''); }}>
            {FENCE_TYPES.map((t) => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
          </select>
        </div>
        {fenceType === 'warehouse' && (
          <div>
            <label className="label">Warehouse</label>
            <select className="input" value={linkedId} onChange={(e) => setLinkedId(e.target.value)}>
              <option value="">— Not linked —</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
        )}
        {fenceType === 'customer' && (
          <div>
            <label className="label">Customer</label>
            <select className="input" value={linkedId} onChange={(e) => setLinkedId(e.target.value)}>
              <option value="">— Not linked —</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.business_name}</option>)}
            </select>
          </div>
        )}
        {fenceType === 'route' && (
          <div>
            <label className="label">Route</label>
            <select className="input" value={linkedId} onChange={(e) => setLinkedId(e.target.value)}>
              <option value="">— Not linked —</option>
              {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Center latitude *</label>
            <input type="number" step="0.000001" className="input" value={lat} onChange={(e) => setLat(e.target.value === '' ? '' : Number(e.target.value))} />
          </div>
          <div>
            <label className="label">Center longitude *</label>
            <input type="number" step="0.000001" className="input" value={lng} onChange={(e) => setLng(e.target.value === '' ? '' : Number(e.target.value))} />
          </div>
        </div>
        <button type="button" className="btn-secondary w-full" onClick={useMyLocation} disabled={locating}>
          <Navigation2 size={14} /> {locating ? 'Locating…' : 'Use my current location'}
        </button>
        <div>
          <label className="label">Radius (meters)</label>
          <input type="number" min={10} className="input" value={radius} onChange={(e) => setRadius(Number(e.target.value))} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={() => { reset(); onClose(); }} disabled={submitting}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={submitting}>{submitting ? 'Creating…' : 'Create geofence'}</button>
        </div>
      </div>
    </Modal>
  );
}

export function GeofencesPage() {
  const { fences, loading, reload, deactivateFence } = useGeofences();
  const { events, loading: loadingEvents } = useGeofenceEvents(null);
  const { push } = useToast();
  const [newOpen, setNewOpen] = useState(false);
  const [toDeactivate, setToDeactivate] = useState<Geofence | null>(null);
  const [busy, setBusy] = useState(false);

  const handleDeactivate = async () => {
    if (!toDeactivate) return;
    setBusy(true);
    const { error } = await deactivateFence(toDeactivate.id);
    setBusy(false);
    setToDeactivate(null);
    push(error ? 'error' : 'success', error ?? 'Geofence deactivated.');
  };

  const fenceColumns: Column<Geofence>[] = [
    { key: 'name', header: 'Name', render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'type', header: 'Type', render: (r) => <span className="capitalize">{r.fence_type}</span> },
    { key: 'center', header: 'Center', render: (r) => `${r.center_lat.toFixed(5)}, ${r.center_lng.toFixed(5)}` },
    { key: 'radius', header: 'Radius', render: (r) => `${r.radius_meters} m` },
    { key: 'status', header: 'Status', render: (r) => <span className={r.is_active ? 'badge-green' : 'badge-slate'}>{r.is_active ? 'Active' : 'Inactive'}</span> },
    {
      key: 'actions', header: '', className: 'text-right',
      render: (r) => (
        <PermissionGate permission="gps_tracking:delete">
          {r.is_active && <button className="btn-ghost !px-2 !py-1 text-red-600" onClick={() => setToDeactivate(r)}><Ban size={16} /></button>}
        </PermissionGate>
      ),
    },
  ];

  const eventColumns: Column<GeofenceEvent>[] = [
    { key: 'van', header: 'Van', render: (r) => r.van?.name ?? '—' },
    { key: 'fence', header: 'Geofence', render: (r) => r.geofence?.name ?? '—' },
    { key: 'type', header: 'Event', render: (r) => <span className={r.event_type === 'arrival' ? 'badge-green' : 'badge-slate'}>{r.event_type}</span> },
    { key: 'when', header: 'When', sortValue: (r) => r.occurred_at, render: (r) => new Date(r.occurred_at).toLocaleString() },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Geofences</h1>
          <p className="text-sm text-slate-500">Warehouse/customer/route/custom zones. Arrival, exit, and sustained unauthorized movement are detected automatically from live GPS.</p>
        </div>
        <PermissionGate permission="gps_tracking:create">
          <button className="btn-primary" onClick={() => setNewOpen(true)}><Plus size={16} /> New geofence</button>
        </PermissionGate>
      </div>

      {fences.length === 0 && !loading ? (
        <div className="card flex flex-col items-center gap-2 p-10 text-center">
          <MapPinned className="text-slate-300" size={36} />
          <p className="text-sm text-slate-500">No geofences defined yet.</p>
        </div>
      ) : (
        <DataTable columns={fenceColumns} rows={fences} rowKey={(r) => r.id} loading={loading} exportFilename="geofences" />
      )}

      <div>
        <h2 className="mb-2 text-lg font-semibold text-slate-800 dark:text-slate-100">Recent arrival / exit events</h2>
        <DataTable columns={eventColumns} rows={events} rowKey={(r) => r.id} loading={loadingEvents} exportFilename="geofence-events" emptyMessage="No geofence events recorded yet." />
      </div>

      <NewFenceModal open={newOpen} onClose={() => setNewOpen(false)} onCreated={reload} />

      <ConfirmDialog
        open={!!toDeactivate}
        title="Deactivate geofence"
        message={`"${toDeactivate?.name}" will stop generating arrival/exit events. Past events are kept.`}
        confirmLabel="Deactivate"
        loading={busy}
        onConfirm={handleDeactivate}
        onCancel={() => setToDeactivate(null)}
      />
    </div>
  );
}
