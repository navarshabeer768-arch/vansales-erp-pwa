import { useState } from 'react';
import { Plus, Wrench, Check, Trash2, CalendarClock } from 'lucide-react';
import { useVans } from '@/hooks/useVans';
import { useMaintenanceRecords, useMaintenanceSchedules, MaintenanceType } from '@/hooks/useMaintenanceRecords';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';
import type { MaintenanceRecord, MaintenanceSchedule } from '@/hooks/useMaintenanceRecords';

const TYPES: MaintenanceType[] = ['oil_change', 'brake_service', 'tyre_replacement', 'battery_replacement', 'general_service', 'inspection', 'custom'];
const TYPE_LABELS: Record<MaintenanceType, string> = {
  oil_change: 'Oil Change', brake_service: 'Brake Service', tyre_replacement: 'Tyre Replacement',
  battery_replacement: 'Battery Replacement', general_service: 'General Service', inspection: 'Inspection', custom: 'Custom',
};

function NewRecordModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { vans } = useVans();
  const { createRecord } = useMaintenanceRecords(null);
  const { push } = useToast();

  const [vanId, setVanId] = useState('');
  const [maintenanceType, setMaintenanceType] = useState<MaintenanceType>('oil_change');
  const [description, setDescription] = useState('');
  const [serviceDate, setServiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [odometer, setOdometer] = useState<number | ''>('');
  const [cost, setCost] = useState(0);
  const [vendor, setVendor] = useState('');
  const [invoiceUrl, setInvoiceUrl] = useState('');
  const [nextServiceDate, setNextServiceDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setVanId(''); setDescription(''); setOdometer(''); setCost(0); setVendor(''); setInvoiceUrl(''); setNextServiceDate('');
  };

  const submit = async () => {
    if (!vanId) { push('error', 'Select a van.'); return; }
    setSubmitting(true);
    const { error } = await createRecord({
      vanId, maintenanceType, description, serviceDate,
      odometerReading: odometer === '' ? undefined : odometer, cost, vendor, invoiceUrl,
      nextServiceDate: nextServiceDate || undefined,
    });
    setSubmitting(false);
    if (error) { push('error', error); return; }
    push('success', 'Maintenance record added.');
    reset();
    onCreated();
    onClose();
  };

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title="Log maintenance" size="sm">
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
            <label className="label">Type</label>
            <select className="input" value={maintenanceType} onChange={(e) => setMaintenanceType(e.target.value as MaintenanceType)}>
              {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Service date</label>
            <input type="date" className="input" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} />
          </div>
          <div>
            <label className="label">Odometer (km)</label>
            <input type="number" min={0} className="input" value={odometer} onChange={(e) => setOdometer(e.target.value === '' ? '' : Number(e.target.value))} />
          </div>
          <div>
            <label className="label">Cost</label>
            <input type="number" min={0} step="0.01" className="input" value={cost} onChange={(e) => setCost(Number(e.target.value))} />
          </div>
          <div>
            <label className="label">Vendor</label>
            <input className="input" value={vendor} onChange={(e) => setVendor(e.target.value)} />
          </div>
          <div>
            <label className="label">Next service date</label>
            <input type="date" className="input" value={nextServiceDate} onChange={(e) => setNextServiceDate(e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="label">Invoice URL</label>
            <input className="input" value={invoiceUrl} onChange={(e) => setInvoiceUrl(e.target.value)} placeholder="https://…" />
          </div>
          <div className="col-span-2">
            <label className="label">Description</label>
            <textarea className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={() => { reset(); onClose(); }} disabled={submitting}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={submitting}>{submitting ? 'Saving…' : 'Save record'}</button>
        </div>
      </div>
    </Modal>
  );
}

function NewScheduleModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { vans } = useVans();
  const { createSchedule } = useMaintenanceSchedules(null);
  const { push } = useToast();

  const [vanId, setVanId] = useState('');
  const [maintenanceType, setMaintenanceType] = useState<MaintenanceType>('oil_change');
  const [intervalKm, setIntervalKm] = useState<number | ''>('');
  const [intervalDays, setIntervalDays] = useState<number | ''>('');
  const [lastServiceDate, setLastServiceDate] = useState('');
  const [lastServiceOdometer, setLastServiceOdometer] = useState<number | ''>('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => { setVanId(''); setIntervalKm(''); setIntervalDays(''); setLastServiceDate(''); setLastServiceOdometer(''); };

  const submit = async () => {
    if (!vanId || (intervalKm === '' && intervalDays === '')) {
      push('error', 'Select a van and set at least one interval (km or days).');
      return;
    }
    setSubmitting(true);
    const { error } = await createSchedule({
      vanId, maintenanceType, intervalKm: intervalKm === '' ? undefined : intervalKm,
      intervalDays: intervalDays === '' ? undefined : intervalDays,
      lastServiceDate: lastServiceDate || undefined, lastServiceOdometer: lastServiceOdometer === '' ? undefined : lastServiceOdometer,
    });
    setSubmitting(false);
    if (error) { push('error', error); return; }
    push('success', 'Schedule created.');
    reset();
    onCreated();
    onClose();
  };

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title="New maintenance schedule" size="sm">
      <div className="space-y-4">
        <div>
          <label className="label">Van *</label>
          <select className="input" value={vanId} onChange={(e) => setVanId(e.target.value)}>
            <option value="">Select a van…</option>
            {vans.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Type</label>
          <select className="input" value={maintenanceType} onChange={(e) => setMaintenanceType(e.target.value as MaintenanceType)}>
            {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Every (km)</label>
            <input type="number" min={0} className="input" value={intervalKm} onChange={(e) => setIntervalKm(e.target.value === '' ? '' : Number(e.target.value))} />
          </div>
          <div>
            <label className="label">Every (days)</label>
            <input type="number" min={0} className="input" value={intervalDays} onChange={(e) => setIntervalDays(e.target.value === '' ? '' : Number(e.target.value))} />
          </div>
          <div>
            <label className="label">Last service date</label>
            <input type="date" className="input" value={lastServiceDate} onChange={(e) => setLastServiceDate(e.target.value)} />
          </div>
          <div>
            <label className="label">Last service odometer</label>
            <input type="number" min={0} className="input" value={lastServiceOdometer} onChange={(e) => setLastServiceOdometer(e.target.value === '' ? '' : Number(e.target.value))} />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={() => { reset(); onClose(); }} disabled={submitting}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={submitting}>{submitting ? 'Saving…' : 'Create schedule'}</button>
        </div>
      </div>
    </Modal>
  );
}

export function MaintenancePage() {
  const [tab, setTab] = useState<'records' | 'schedules'>('records');
  const { records, loading, reload, approveRecord, deleteRecord } = useMaintenanceRecords(null);
  const { schedules, loading: loadingSchedules, reload: reloadSchedules, deactivateSchedule } = useMaintenanceSchedules(null);
  const { push } = useToast();
  const [newRecordOpen, setNewRecordOpen] = useState(false);
  const [newScheduleOpen, setNewScheduleOpen] = useState(false);

  const recordColumns: Column<MaintenanceRecord>[] = [
    { key: 'date', header: 'Date', sortValue: (r) => r.service_date, render: (r) => r.service_date },
    { key: 'van', header: 'Van', render: (r) => r.van?.name ?? '—' },
    { key: 'type', header: 'Type', render: (r) => TYPE_LABELS[r.maintenance_type] },
    { key: 'cost', header: 'Cost', sortValue: (r) => r.cost, render: (r) => r.cost.toFixed(2) },
    { key: 'vendor', header: 'Vendor', render: (r) => r.vendor ?? '—' },
    { key: 'next', header: 'Next due', render: (r) => r.next_service_date ?? '—' },
    { key: 'invoice', header: 'Invoice', render: (r) => r.invoice_url ? <a href={r.invoice_url} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline dark:text-brand-400">View</a> : '—' },
    { key: 'approved', header: 'Approved', render: (r) => r.approved_at ? <span className="badge-green">Yes</span> : <span className="badge-slate">No</span> },
    {
      key: 'actions', header: '', className: 'text-right',
      render: (r) => (
        <div className="flex justify-end gap-1">
          {!r.approved_at && (
            <PermissionGate permission="maintenance:approve">
              <button className="btn-secondary !py-1" onClick={async () => {
                const { error } = await approveRecord(r.id);
                push(error ? 'error' : 'success', error ?? 'Approved.');
              }}><Check size={14} /> Approve</button>
            </PermissionGate>
          )}
          <PermissionGate permission="maintenance:delete">
            <button className="btn-ghost !px-2 !py-1 text-red-600" onClick={async () => {
              const { error } = await deleteRecord(r.id);
              push(error ? 'error' : 'success', error ?? 'Deleted.');
            }}><Trash2 size={14} /></button>
          </PermissionGate>
        </div>
      ),
    },
  ];

  const scheduleColumns: Column<MaintenanceSchedule>[] = [
    { key: 'van', header: 'Van', render: (r) => r.van?.name ?? '—' },
    { key: 'type', header: 'Type', render: (r) => TYPE_LABELS[r.maintenance_type] },
    { key: 'interval', header: 'Interval', render: (r) => [
      r.interval_km ? `${r.interval_km} km` : null, r.interval_days ? `${r.interval_days} days` : null,
    ].filter(Boolean).join(' / ') || '—' },
    { key: 'last', header: 'Last service', render: (r) => r.last_service_date ?? '—' },
    { key: 'odometer', header: 'Current odometer', render: (r) => r.van?.current_odometer ?? '—' },
    {
      key: 'actions', header: '', className: 'text-right',
      render: (r) => (
        <PermissionGate permission="maintenance:delete">
          <button className="btn-ghost !px-2 !py-1 text-red-600" onClick={async () => {
            const { error } = await deactivateSchedule(r.id);
            push(error ? 'error' : 'success', error ?? 'Schedule deactivated.');
          }}><Trash2 size={14} /></button>
        </PermissionGate>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Vehicle Maintenance</h1>
          <p className="text-sm text-slate-500">Service records (with approval), recurring schedules, and invoices.</p>
        </div>
        {tab === 'records' ? (
          <PermissionGate permission="maintenance:create">
            <button className="btn-primary" onClick={() => setNewRecordOpen(true)}><Plus size={16} /> Log maintenance</button>
          </PermissionGate>
        ) : (
          <PermissionGate permission="maintenance:create">
            <button className="btn-primary" onClick={() => setNewScheduleOpen(true)}><CalendarClock size={16} /> New schedule</button>
          </PermissionGate>
        )}
      </div>

      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        <button onClick={() => setTab('records')} className={`border-b-2 px-4 py-2 text-sm font-medium ${tab === 'records' ? 'border-brand-700 text-brand-700 dark:text-brand-400' : 'border-transparent text-slate-500'}`}>Records</button>
        <button onClick={() => setTab('schedules')} className={`border-b-2 px-4 py-2 text-sm font-medium ${tab === 'schedules' ? 'border-brand-700 text-brand-700 dark:text-brand-400' : 'border-transparent text-slate-500'}`}>Schedules</button>
      </div>

      {tab === 'records' ? (
        records.length === 0 && !loading ? (
          <div className="card flex flex-col items-center gap-2 p-10 text-center">
            <Wrench className="text-slate-300" size={36} />
            <p className="text-sm text-slate-500">No maintenance records yet.</p>
          </div>
        ) : (
          <DataTable columns={recordColumns} rows={records} rowKey={(r) => r.id} loading={loading} exportFilename="maintenance-records" />
        )
      ) : (
        schedules.length === 0 && !loadingSchedules ? (
          <div className="card flex flex-col items-center gap-2 p-10 text-center">
            <CalendarClock className="text-slate-300" size={36} />
            <p className="text-sm text-slate-500">No maintenance schedules set up yet.</p>
          </div>
        ) : (
          <DataTable columns={scheduleColumns} rows={schedules} rowKey={(r) => r.id} loading={loadingSchedules} exportFilename="maintenance-schedules" />
        )
      )}

      <NewRecordModal open={newRecordOpen} onClose={() => setNewRecordOpen(false)} onCreated={reload} />
      <NewScheduleModal open={newScheduleOpen} onClose={() => setNewScheduleOpen(false)} onCreated={reloadSchedules} />
    </div>
  );
}
