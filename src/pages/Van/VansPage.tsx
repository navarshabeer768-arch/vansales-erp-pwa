import { useState, useEffect } from 'react';
import { Plus, Pencil, Ban, Truck as TruckIcon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useVans, useSalesmenAndDrivers, Van, VanInput } from '@/hooks/useVans';
import { useWarehouses } from '@/hooks/useWarehouses';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';

const schema = z.object({
  code: z.string().min(1, 'Code is required').max(20),
  name: z.string().min(1, 'Name is required').max(150),
  registration_no: z.string().max(50).optional().or(z.literal('')),
  home_warehouse_id: z.string().optional().or(z.literal('')),
  driver_id: z.string().optional().or(z.literal('')),
  salesman_id: z.string().optional().or(z.literal('')),
  status: z.enum(['active', 'maintenance', 'inactive']),
});
type FormValues = z.infer<typeof schema>;

function VanForm({ initial, onSubmit, onCancel }: {
  initial?: Van | null;
  onSubmit: (v: VanInput) => Promise<{ error: string | null }>;
  onCancel: () => void;
}) {
  const { warehouses } = useWarehouses();
  const { drivers, salesmen } = useSalesmenAndDrivers();
  const { register, handleSubmit, reset, formState: { errors, isSubmitting }, setError } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { code: '', name: '', registration_no: '', home_warehouse_id: '', driver_id: '', salesman_id: '', status: 'active' },
  });

  useEffect(() => {
    if (initial) {
      reset({
        code: initial.code, name: initial.name, registration_no: initial.registration_no ?? '',
        home_warehouse_id: initial.home_warehouse_id ?? '', driver_id: initial.driver_id ?? '',
        salesman_id: initial.salesman_id ?? '', status: initial.status,
      });
    }
  }, [initial, reset]);

  const submit = async (v: FormValues) => {
    const { error } = await onSubmit({
      code: v.code, name: v.name, registration_no: v.registration_no || null,
      home_warehouse_id: v.home_warehouse_id || null, driver_id: v.driver_id || null,
      salesman_id: v.salesman_id || null, status: v.status, insurance_expiry: null,
    });
    if (error) setError('code', { message: error });
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4">
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
      <div>
        <label className="label" htmlFor="registration_no">Registration number</label>
        <input id="registration_no" className="input" {...register('registration_no')} />
      </div>
      <div>
        <label className="label" htmlFor="home_warehouse_id">Home warehouse</label>
        <select id="home_warehouse_id" className="input" {...register('home_warehouse_id')}>
          <option value="">— None —</option>
          {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label" htmlFor="driver_id">Driver</label>
          <select id="driver_id" className="input" {...register('driver_id')}>
            <option value="">— None —</option>
            {drivers.map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="salesman_id">Salesman</label>
          <select id="salesman_id" className="input" {...register('salesman_id')}>
            <option value="">— None —</option>
            {salesmen.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="status">Status</label>
        <select id="status" className="input" {...register('status')}>
          <option value="active">Active</option>
          <option value="maintenance">In maintenance</option>
          <option value="inactive">Inactive</option>
        </select>
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

export function VansPage() {
  const { vans, loading, createVan, updateVan, deactivateVan } = useVans();
  const { push } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Van | null>(null);
  const [toDeactivate, setToDeactivate] = useState<Van | null>(null);
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

  const statusBadge = (s: Van['status']) => s === 'active' ? 'badge-green' : s === 'maintenance' ? 'badge-amber' : 'badge-slate';

  const columns: Column<Van>[] = [
    { key: 'name', header: 'Van', sortValue: (r) => r.name, render: (r) => (
      <div><p className="font-medium">{r.name}</p><p className="text-xs text-slate-500">{r.code}{r.registration_no ? ` · ${r.registration_no}` : ''}</p></div>
    ) },
    { key: 'home_warehouse', header: 'Home warehouse', render: (r) => r.home_warehouse?.name ?? '—' },
    { key: 'driver', header: 'Driver', render: (r) => r.driver?.full_name ?? '—' },
    { key: 'salesman', header: 'Salesman', render: (r) => r.salesman?.full_name ?? '—' },
    { key: 'status', header: 'Status', render: (r) => <span className={statusBadge(r.status)}>{r.status}</span> },
    {
      key: 'actions', header: '', className: 'text-right',
      render: (r) => (
        <div className="flex justify-end gap-1">
          <PermissionGate permission="van_loading:edit">
            <button className="btn-ghost !px-2 !py-1" onClick={() => { setEditing(r); setFormOpen(true); }}><Pencil size={16} /></button>
          </PermissionGate>
          <PermissionGate permission="van_loading:delete">
            {r.status !== 'inactive' && <button className="btn-ghost !px-2 !py-1 text-red-600" onClick={() => setToDeactivate(r)}><Ban size={16} /></button>}
          </PermissionGate>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Vans</h1>
          <p className="text-sm text-slate-500">Fleet, driver/salesman assignment, and home warehouse.</p>
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
        <DataTable columns={columns} rows={vans} rowKey={(r) => r.id} loading={loading}
          searchPlaceholder="Search vans…" searchFn={(r, q) => r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q)} />
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'Edit van' : 'New van'}>
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
    </div>
  );
}
