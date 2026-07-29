import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil, Ban, Truck as TruckIcon, ArchiveRestore, Archive as ArchiveIcon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useVans, useArchivedVans, Van, VanInput } from '@/hooks/useVans';
import { useWarehouses } from '@/hooks/useWarehouses';
import { supabase } from '@/lib/supabase';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';

const schema = z.object({
  code: z.string().min(1, 'Code is required').max(20),
  name: z.string().min(1, 'Name is required').max(150),
  registration_no: z.string().max(50).optional().or(z.literal('')),
  vin_number: z.string().max(50).optional().or(z.literal('')),
  chassis_number: z.string().max(50).optional().or(z.literal('')),
  engine_number: z.string().max(50).optional().or(z.literal('')),
  vehicle_type: z.string().max(50).optional().or(z.literal('')),
  capacity: z.string().max(50).optional().or(z.literal('')),
  current_odometer: z.coerce.number().min(0).optional(),
  purchase_date: z.string().optional().or(z.literal('')),
  road_permit_no: z.string().max(50).optional().or(z.literal('')),
  permit_expiry: z.string().optional().or(z.literal('')),
  registration_expiry: z.string().optional().or(z.literal('')),
  insurance_expiry: z.string().optional().or(z.literal('')),
  notes: z.string().max(1000).optional().or(z.literal('')),
  home_warehouse_id: z.string().optional().or(z.literal('')),
  status: z.enum(['active', 'maintenance', 'inactive']),
});
type FormValues = z.infer<typeof schema>;

function VanForm({ initial, onSubmit, onCancel }: {
  initial?: Van | null;
  onSubmit: (v: VanInput) => Promise<{ error: string | null }>;
  onCancel: () => void;
}) {
  const { warehouses } = useWarehouses();
  const { register, handleSubmit, reset, formState: { errors, isSubmitting }, setError } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      code: '', name: '', registration_no: '', vin_number: '', chassis_number: '', engine_number: '',
      vehicle_type: '', capacity: '', purchase_date: '', road_permit_no: '', permit_expiry: '',
      registration_expiry: '', insurance_expiry: '', notes: '',
      home_warehouse_id: '', status: 'active',
    },
  });

  useEffect(() => {
    if (initial) {
      reset({
        code: initial.code, name: initial.name, registration_no: initial.registration_no ?? '',
        vin_number: initial.vin_number ?? '', chassis_number: initial.chassis_number ?? '',
        engine_number: initial.engine_number ?? '', vehicle_type: initial.vehicle_type ?? '',
        capacity: initial.capacity ?? '', current_odometer: initial.current_odometer ?? undefined,
        purchase_date: initial.purchase_date ?? '', road_permit_no: initial.road_permit_no ?? '',
        permit_expiry: initial.permit_expiry ?? '', registration_expiry: initial.registration_expiry ?? '',
        insurance_expiry: initial.insurance_expiry ?? '', notes: initial.notes ?? '',
        home_warehouse_id: initial.home_warehouse_id ?? '', status: initial.status,
      });
    }
  }, [initial, reset]);

  const submit = async (v: FormValues) => {
    const { error } = await onSubmit({
      code: v.code, name: v.name, registration_no: v.registration_no || null,
      vin_number: v.vin_number || null, chassis_number: v.chassis_number || null,
      engine_number: v.engine_number || null, vehicle_type: v.vehicle_type || null,
      capacity: v.capacity || null, current_odometer: v.current_odometer ?? null,
      purchase_date: v.purchase_date || null, road_permit_no: v.road_permit_no || null,
      permit_expiry: v.permit_expiry || null, registration_expiry: v.registration_expiry || null,
      insurance_expiry: v.insurance_expiry || null, notes: v.notes || null,
      home_warehouse_id: v.home_warehouse_id || null, status: v.status,
    });
    if (error) setError('code', { message: error });
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label" htmlFor="code">Code *</label>
          <input id="code" className="input" {...register('code')} />
          {errors.code && <p className="error-text">{errors.code.message}</p>}
        </div>
        <div>
          <label className="label" htmlFor="name">Name *</label>
          <input id="name" className="input" {...register('name')} />
          {errors.name && <p className="error-text">{errors.name.message}</p>}
        </div>
      </div>

      <fieldset className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
        <legend className="px-1 text-sm font-medium text-slate-700 dark:text-slate-300">Vehicle identification</legend>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="registration_no">Registration number</label>
            <input id="registration_no" className="input" {...register('registration_no')} />
          </div>
          <div>
            <label className="label" htmlFor="vin_number">VIN number</label>
            <input id="vin_number" className="input" {...register('vin_number')} />
          </div>
          <div>
            <label className="label" htmlFor="chassis_number">Chassis number</label>
            <input id="chassis_number" className="input" {...register('chassis_number')} />
          </div>
          <div>
            <label className="label" htmlFor="engine_number">Engine number</label>
            <input id="engine_number" className="input" {...register('engine_number')} />
          </div>
          <div>
            <label className="label" htmlFor="vehicle_type">Vehicle type</label>
            <input id="vehicle_type" className="input" placeholder="e.g. Box truck, Pickup" {...register('vehicle_type')} />
          </div>
          <div>
            <label className="label" htmlFor="capacity">Capacity</label>
            <input id="capacity" className="input" placeholder="e.g. 2 tons" {...register('capacity')} />
          </div>
          <div>
            <label className="label" htmlFor="current_odometer">Current odometer (km)</label>
            <input id="current_odometer" type="number" step="0.1" className="input" {...register('current_odometer')} />
          </div>
          <div>
            <label className="label" htmlFor="purchase_date">Purchase date</label>
            <input id="purchase_date" type="date" className="input" {...register('purchase_date')} />
          </div>
        </div>
      </fieldset>

      <fieldset className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
        <legend className="px-1 text-sm font-medium text-slate-700 dark:text-slate-300">Documents &amp; expiry</legend>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="road_permit_no">Road permit number</label>
            <input id="road_permit_no" className="input" {...register('road_permit_no')} />
          </div>
          <div>
            <label className="label" htmlFor="permit_expiry">Permit expiry</label>
            <input id="permit_expiry" type="date" className="input" {...register('permit_expiry')} />
          </div>
          <div>
            <label className="label" htmlFor="registration_expiry">Registration expiry</label>
            <input id="registration_expiry" type="date" className="input" {...register('registration_expiry')} />
          </div>
          <div>
            <label className="label" htmlFor="insurance_expiry">Insurance expiry</label>
            <input id="insurance_expiry" type="date" className="input" {...register('insurance_expiry')} />
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500">For itemized documents with files, use the van's Documents tab after saving.</p>
      </fieldset>

      <div>
        <label className="label" htmlFor="home_warehouse_id">Home warehouse</label>
        <select id="home_warehouse_id" className="input" {...register('home_warehouse_id')}>
          <option value="">— None —</option>
          {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </div>
      <p className="text-xs text-slate-500">
        Staffing (driver, salesman, helper, collector — any employee can hold any combination of roles,
        and more than one person can share a role) is managed from the van's <strong>Staff</strong> tab after saving,
        not here — a van isn't limited to one fixed driver and one fixed salesman.
      </p>
      <div>
        <label className="label" htmlFor="status">Status</label>
        <select id="status" className="input" {...register('status')}>
          <option value="active">Active</option>
          <option value="maintenance">In maintenance</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>
      <div>
        <label className="label" htmlFor="notes">Notes</label>
        <textarea id="notes" className="input" rows={2} {...register('notes')} />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={isSubmitting}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : initial ? 'Save changes' : 'Create van'}
        </button>
      </div>
    </form>
  );
}

function ArchivedVansSection() {
  const { vans, loading, reload } = useArchivedVans();
  const { push } = useToast();
  const [toRestore, setToRestore] = useState<Van | null>(null);
  const [busy, setBusy] = useState(false);

  const handleRestore = async () => {
    if (!toRestore) return;
    setBusy(true);
    const { error } = await supabase.from('vans').update({ is_archived: false }).eq('id', toRestore.id);
    setBusy(false);
    setToRestore(null);
    push(error ? 'error' : 'success', error?.message ?? 'Van restored.');
    reload();
  };

  if (vans.length === 0 && !loading) return null;

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Archived vans</h2>
      <div className="card divide-y divide-slate-100 dark:divide-slate-800">
        {vans.map((v) => (
          <div key={v.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="font-medium">{v.name}</p>
              <p className="text-xs text-slate-500">{v.code}</p>
            </div>
            <PermissionGate permission="van_loading:edit">
              <button className="btn-secondary !py-1" onClick={() => setToRestore(v)}>
                <ArchiveRestore size={14} /> Restore
              </button>
            </PermissionGate>
          </div>
        ))}
      </div>
      <ConfirmDialog
        open={!!toRestore}
        title="Restore van"
        message={`"${toRestore?.name}" will reappear in the active fleet list.`}
        confirmLabel="Restore"
        danger={false}
        loading={busy}
        onConfirm={handleRestore}
        onCancel={() => setToRestore(null)}
      />
    </div>
  );
}

export function VansPage() {
  const { vans, loading, createVan, updateVan, deactivateVan, archiveVan } = useVans();
  const { push } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Van | null>(null);
  const [toDeactivate, setToDeactivate] = useState<Van | null>(null);
  const [toArchive, setToArchive] = useState<Van | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (v: VanInput) => {
    const result = editing ? await updateVan(editing.id, v) : await createVan(v);
    if (!result.error) { push('success', editing ? 'Van updated.' : 'Van created.'); setFormOpen(false); }
    return result;
  };

  const handleDeactivate = async () => {
    if (!toDeactivate) return;
    setBusy(true);
    const { error } = await deactivateVan(toDeactivate.id);
    setBusy(false);
    setToDeactivate(null);
    push(error ? 'error' : 'success', error ?? 'Van marked inactive.');
  };

  const handleArchive = async () => {
    if (!toArchive) return;
    setBusy(true);
    const { error } = await archiveVan(toArchive.id);
    setBusy(false);
    setToArchive(null);
    push(error ? 'error' : 'success', error ?? 'Van archived.');
  };

  const statusBadge = (s: Van['status']) => s === 'active' ? 'badge-green' : s === 'maintenance' ? 'badge-amber' : 'badge-slate';

  const expiryBadge = (date: string | null) => {
    if (!date) return null;
    const days = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
    if (days < 0) return <span className="badge-red">Expired</span>;
    if (days <= 30) return <span className="badge-amber">{days}d</span>;
    return null;
  };

  const columns: Column<Van>[] = [
    { key: 'name', header: 'Van', sortValue: (r) => r.name, render: (r) => (
      <div>
        <Link to={`/van-loading/vans/${r.id}`} className="font-medium text-brand-700 hover:underline dark:text-brand-400">{r.name}</Link>
        <p className="text-xs text-slate-500">{r.code}{r.registration_no ? ` · ${r.registration_no}` : ''}</p>
      </div>
    ) },
    { key: 'home_warehouse', header: 'Home warehouse', render: (r) => r.home_warehouse?.name ?? '—' },
    { key: 'expiry', header: 'Expiry alerts', render: (r) => (
      <div className="flex gap-1">
        {expiryBadge(r.insurance_expiry) && <span title="Insurance">{expiryBadge(r.insurance_expiry)}</span>}
        {expiryBadge(r.registration_expiry) && <span title="Registration">{expiryBadge(r.registration_expiry)}</span>}
        {expiryBadge(r.permit_expiry) && <span title="Permit">{expiryBadge(r.permit_expiry)}</span>}
      </div>
    ) },
    { key: 'status', header: 'Status', render: (r) => <span className={statusBadge(r.status)}>{r.status}</span> },
    {
      key: 'actions', header: '', className: 'text-right',
      render: (r) => (
        <div className="flex justify-end gap-1">
          <PermissionGate permission="van_loading:edit">
            <button className="btn-ghost !px-2 !py-1" onClick={() => { setEditing(r); setFormOpen(true); }}><Pencil size={16} /></button>
          </PermissionGate>
          <PermissionGate permission="van_loading:delete">
            {r.status !== 'inactive' && <button className="btn-ghost !px-2 !py-1 text-red-600" onClick={() => setToDeactivate(r)} title="Mark inactive"><Ban size={16} /></button>}
            <button className="btn-ghost !px-2 !py-1 text-slate-500" onClick={() => setToArchive(r)} title="Archive"><ArchiveIcon size={16} /></button>
          </PermissionGate>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Vans</h1>
          <p className="text-sm text-slate-500">Fleet, home warehouse, and document expiry. Click a van to manage its staff.</p>
        </div>
        <PermissionGate permission="van_loading:create">
          <button className="btn-primary" onClick={() => { setEditing(null); setFormOpen(true); }}><Plus size={16} /> New van</button>
        </PermissionGate>
      </div>

      {vans.length === 0 && !loading ? (
        <div className="card flex flex-col items-center gap-3 p-12 text-center">
          <TruckIcon className="text-slate-300" size={40} />
          <p className="font-medium text-slate-600 dark:text-slate-300">No vans yet</p>
          <PermissionGate permission="van_loading:create">
            <button className="btn-primary" onClick={() => { setEditing(null); setFormOpen(true); }}><Plus size={16} /> New van</button>
          </PermissionGate>
        </div>
      ) : (
        <DataTable columns={columns} rows={vans} rowKey={(r) => r.id} loading={loading} exportFilename="vans"
          searchPlaceholder="Search vans…" searchFn={(r, q) => r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q)} />
      )}

      <ArchivedVansSection />

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'Edit van' : 'New van'} size="lg">
        <VanForm initial={editing} onSubmit={handleSubmit} onCancel={() => setFormOpen(false)} />
      </Modal>

      <ConfirmDialog
        open={!!toDeactivate}
        title="Mark van inactive"
        message={`"${toDeactivate?.name}" will be hidden from new loading sheets. Existing stock and history are kept.`}
        confirmLabel="Mark inactive"
        loading={busy}
        onConfirm={handleDeactivate}
        onCancel={() => setToDeactivate(null)}
      />

      <ConfirmDialog
        open={!!toArchive}
        title="Archive van"
        message={`"${toArchive?.name}" will be removed from the active fleet list entirely (not just marked inactive). You can restore it later from the Archived vans section below.`}
        confirmLabel="Archive"
        loading={busy}
        onConfirm={handleArchive}
        onCancel={() => setToArchive(null)}
      />
    </div>
  );
}
