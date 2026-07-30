import { useState } from 'react';
import { Plus, Fuel, Trash2 } from 'lucide-react';
import { useVans } from '@/hooks/useVans';
import { useFuelLogs, useFuelMileage, FuelType } from '@/hooks/useFuelLogs';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';
import type { FuelLog } from '@/hooks/useFuelLogs';

const FUEL_TYPES: FuelType[] = ['petrol', 'diesel', 'cng', 'electric'];

function NewFuelLogModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { vans } = useVans();
  const { createLog } = useFuelLogs(null);
  const { push } = useToast();

  const [vanId, setVanId] = useState('');
  const [fuelDate, setFuelDate] = useState(new Date().toISOString().slice(0, 10));
  const [fuelType, setFuelType] = useState<FuelType>('diesel');
  const [quantity, setQuantity] = useState(0);
  const [cost, setCost] = useState(0);
  const [odometer, setOdometer] = useState(0);
  const [vendor, setVendor] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => { setVanId(''); setQuantity(0); setCost(0); setOdometer(0); setVendor(''); };

  const submit = async () => {
    if (!vanId || quantity <= 0 || cost <= 0 || odometer <= 0) {
      push('error', 'Select a van and enter quantity, cost, and odometer reading.');
      return;
    }
    setSubmitting(true);
    const { error } = await createLog({ vanId, fuelDate, fuelType, quantity, cost, odometerReading: odometer, vendor });
    setSubmitting(false);
    if (error) { push('error', error); return; }
    push('success', 'Fuel entry recorded.');
    reset();
    onCreated();
    onClose();
  };

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title="Log fuel entry" size="sm">
      <div className="space-y-4">
        <div>
          <label className="label">Van *</label>
          <select className="input" value={vanId} onChange={(e) => setVanId(e.target.value)}>
            <option value="">Select a van…</option>
            {vans.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Date</label>
            <input type="date" className="input" value={fuelDate} onChange={(e) => setFuelDate(e.target.value)} />
          </div>
          <div>
            <label className="label">Fuel type</label>
            <select className="input" value={fuelType} onChange={(e) => setFuelType(e.target.value as FuelType)}>
              {FUEL_TYPES.map((t) => <option key={t} value={t}>{t.toUpperCase()}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Quantity (L) *</label>
            <input type="number" min={0} step="0.01" className="input" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
          </div>
          <div>
            <label className="label">Cost *</label>
            <input type="number" min={0} step="0.01" className="input" value={cost} onChange={(e) => setCost(Number(e.target.value))} />
          </div>
          <div className="col-span-2">
            <label className="label">Odometer reading (km) *</label>
            <input type="number" min={0} step="0.1" className="input" value={odometer} onChange={(e) => setOdometer(Number(e.target.value))} />
          </div>
          <div className="col-span-2">
            <label className="label">Vendor / station</label>
            <input className="input" value={vendor} onChange={(e) => setVendor(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={() => { reset(); onClose(); }} disabled={submitting}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={submitting}>{submitting ? 'Saving…' : 'Log entry'}</button>
        </div>
      </div>
    </Modal>
  );
}

export function FuelManagementPage() {
  const { vans } = useVans();
  const [vanFilter, setVanFilter] = useState('');
  const { logs, loading, reload, deleteLog } = useFuelLogs(vanFilter || null);
  const { averageMileage } = useFuelMileage(vanFilter || null);
  const { push } = useToast();
  const [newOpen, setNewOpen] = useState(false);

  const totalCost = logs.reduce((sum, l) => sum + l.cost, 0);
  const totalQuantity = logs.reduce((sum, l) => sum + l.quantity, 0);

  const columns: Column<FuelLog>[] = [
    { key: 'date', header: 'Date', sortValue: (r) => r.fuel_date, render: (r) => r.fuel_date },
    { key: 'van', header: 'Van', render: (r) => r.van?.name ?? '—' },
    { key: 'type', header: 'Type', render: (r) => <span className="uppercase">{r.fuel_type}</span> },
    { key: 'quantity', header: 'Quantity (L)', sortValue: (r) => r.quantity, render: (r) => r.quantity.toFixed(2) },
    { key: 'cost', header: 'Cost', sortValue: (r) => r.cost, render: (r) => r.cost.toFixed(2) },
    { key: 'odometer', header: 'Odometer', sortValue: (r) => r.odometer_reading, render: (r) => r.odometer_reading.toFixed(1) },
    { key: 'vendor', header: 'Vendor', render: (r) => r.vendor ?? '—' },
    {
      key: 'actions', header: '', className: 'text-right',
      render: (r) => (
        <PermissionGate permission="fuel:delete">
          <button className="btn-ghost !px-2 !py-1 text-red-600" onClick={async () => {
            const { error } = await deleteLog(r.id);
            push(error ? 'error' : 'success', error ?? 'Entry deleted.');
          }}><Trash2 size={14} /></button>
        </PermissionGate>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Fuel Management</h1>
          <p className="text-sm text-slate-500">Fuel entries, cost, and computed mileage per van.</p>
        </div>
        <PermissionGate permission="fuel:create">
          <button className="btn-primary" onClick={() => setNewOpen(true)}><Plus size={16} /> Log fuel entry</button>
        </PermissionGate>
      </div>

      <div className="card flex flex-wrap items-end gap-4 p-4">
        <div>
          <label className="label">Filter by van</label>
          <select className="input" value={vanFilter} onChange={(e) => setVanFilter(e.target.value)}>
            <option value="">All vans</option>
            {vans.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
        <div className="ml-auto flex gap-6 text-right">
          <div><p className="text-lg font-bold">{totalQuantity.toFixed(1)} L</p><p className="text-xs text-slate-500">Total fuel</p></div>
          <div><p className="text-lg font-bold">{totalCost.toFixed(2)}</p><p className="text-xs text-slate-500">Total cost</p></div>
          {vanFilter && (
            <div><p className="text-lg font-bold">{averageMileage !== null ? `${averageMileage.toFixed(1)} km/L` : '—'}</p><p className="text-xs text-slate-500">Avg. mileage</p></div>
          )}
        </div>
      </div>

      {logs.length === 0 && !loading ? (
        <div className="card flex flex-col items-center gap-2 p-10 text-center">
          <Fuel className="text-slate-300" size={36} />
          <p className="text-sm text-slate-500">No fuel entries logged yet.</p>
        </div>
      ) : (
        <DataTable columns={columns} rows={logs} rowKey={(r) => r.id} loading={loading} exportFilename="fuel-log" />
      )}

      <NewFuelLogModal open={newOpen} onClose={() => setNewOpen(false)} onCreated={reload} />
    </div>
  );
}
