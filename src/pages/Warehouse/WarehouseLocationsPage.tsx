import { useState } from 'react';
import { Plus, MapPinned, Ban } from 'lucide-react';
import { useWarehouseLocations, WarehouseLocation } from '@/hooks/useWarehouseLocations';
import { useWarehouses } from '@/hooks/useWarehouses';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';

function NewLocationModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { warehouses } = useWarehouses();
  const { createLocation } = useWarehouseLocations(null);
  const { push } = useToast();

  const [warehouseId, setWarehouseId] = useState('');
  const [zone, setZone] = useState('');
  const [rack, setRack] = useState('');
  const [shelf, setShelf] = useState('');
  const [bin, setBin] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => { setWarehouseId(''); setZone(''); setRack(''); setShelf(''); setBin(''); };

  const submit = async () => {
    if (!warehouseId || !zone.trim()) { push('error', 'Select a warehouse and enter at least a Zone.'); return; }
    setSubmitting(true);
    const { error } = await createLocation({ warehouseId, zone: zone.trim(), rack: rack.trim(), shelf: shelf.trim(), bin: bin.trim() });
    setSubmitting(false);
    if (error) { push('error', error); return; }
    push('success', 'Location added.');
    reset();
    onCreated();
    onClose();
  };

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title="New warehouse location" size="sm">
      <div className="space-y-4">
        <div>
          <label className="label">Warehouse *</label>
          <select className="input" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            <option value="">Select a warehouse…</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Zone *</label>
            <input className="input" value={zone} onChange={(e) => setZone(e.target.value)} placeholder="A" />
          </div>
          <div>
            <label className="label">Rack</label>
            <input className="input" value={rack} onChange={(e) => setRack(e.target.value)} placeholder="01" />
          </div>
          <div>
            <label className="label">Shelf</label>
            <input className="input" value={shelf} onChange={(e) => setShelf(e.target.value)} placeholder="02" />
          </div>
          <div>
            <label className="label">Bin</label>
            <input className="input" value={bin} onChange={(e) => setBin(e.target.value)} placeholder="03" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={() => { reset(); onClose(); }} disabled={submitting}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={submitting}>
            {submitting ? 'Adding…' : 'Add location'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function WarehouseLocationsPage() {
  const { locations, loading, reload, deactivateLocation } = useWarehouseLocations(null);
  const { push } = useToast();
  const [newOpen, setNewOpen] = useState(false);
  const [toDeactivate, setToDeactivate] = useState<WarehouseLocation | null>(null);
  const [busy, setBusy] = useState(false);

  const handleDeactivate = async () => {
    if (!toDeactivate) return;
    setBusy(true);
    const { error } = await deactivateLocation(toDeactivate.id);
    setBusy(false);
    setToDeactivate(null);
    push(error ? 'error' : 'success', error ?? 'Location deactivated.');
  };

  const columns: Column<WarehouseLocation>[] = [
    { key: 'code', header: 'Location code', sortValue: (r) => r.code, render: (r) => <span className="font-medium">{r.code}</span> },
    { key: 'warehouse', header: 'Warehouse', render: (r) => r.warehouse?.name ?? '—' },
    { key: 'zone', header: 'Zone', render: (r) => r.zone },
    { key: 'rack', header: 'Rack', render: (r) => r.rack ?? '—' },
    { key: 'shelf', header: 'Shelf', render: (r) => r.shelf ?? '—' },
    { key: 'bin', header: 'Bin', render: (r) => r.bin ?? '—' },
    { key: 'status', header: 'Status', render: (r) => <span className={r.is_active ? 'badge-green' : 'badge-slate'}>{r.is_active ? 'Active' : 'Inactive'}</span> },
    {
      key: 'actions', header: '', className: 'text-right',
      render: (r) => (
        <PermissionGate permission="warehouse:delete">
          {r.is_active && <button className="btn-ghost !px-2 !py-1 text-red-600" onClick={() => setToDeactivate(r)}><Ban size={16} /></button>}
        </PermissionGate>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Warehouse Locations</h1>
          <p className="text-sm text-slate-500">Zone / Rack / Shelf / Bin positions across every warehouse. Assign stock to a location from the Stock page.</p>
        </div>
        <PermissionGate permission="warehouse:create">
          <button className="btn-primary" onClick={() => setNewOpen(true)}><Plus size={16} /> New location</button>
        </PermissionGate>
      </div>

      {locations.length === 0 && !loading ? (
        <div className="card flex flex-col items-center gap-2 p-10 text-center">
          <MapPinned className="text-slate-300" size={36} />
          <p className="font-medium text-slate-600 dark:text-slate-300">No locations defined yet</p>
        </div>
      ) : (
        <DataTable columns={columns} rows={locations} rowKey={(r) => r.id} loading={loading} exportFilename="warehouse-locations" />
      )}

      <NewLocationModal open={newOpen} onClose={() => setNewOpen(false)} onCreated={reload} />

      <ConfirmDialog
        open={!!toDeactivate}
        title="Deactivate location"
        message={`"${toDeactivate?.code}" will no longer be assignable to stock. Existing assignments are kept.`}
        confirmLabel="Deactivate"
        loading={busy}
        onConfirm={handleDeactivate}
        onCancel={() => setToDeactivate(null)}
      />
    </div>
  );
}
