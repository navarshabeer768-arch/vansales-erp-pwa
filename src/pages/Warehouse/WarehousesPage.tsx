import { useState } from 'react';
import { Plus, Pencil, Ban, Warehouse as WarehouseIcon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useWarehouses, WarehouseInput } from '@/hooks/useWarehouses';
import type { Warehouse } from '@/types/database';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';

const schema = z.object({
  code: z.string().min(1, 'Code is required').max(20),
  name: z.string().min(1, 'Name is required').max(150),
  address: z.string().max(300).optional().or(z.literal('')),
  is_active: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

function WarehouseForm({ initial, onSubmit, onCancel }: {
  initial?: Warehouse | null;
  onSubmit: (v: WarehouseInput) => Promise<{ error: string | null }>;
  onCancel: () => void;
}) {
  const { register, handleSubmit, reset, formState: { errors, isSubmitting }, setError } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { code: '', name: '', address: '', is_active: true },
  });

  useEffect(() => {
    if (initial) reset({ code: initial.code, name: initial.name, address: initial.address ?? '', is_active: initial.is_active });
  }, [initial, reset]);

  const submit = async (v: FormValues) => {
    const { error } = await onSubmit({
      code: v.code, name: v.name, address: v.address || null, is_active: v.is_active,
      latitude: null, longitude: null, manager_id: null,
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
        <label className="label" htmlFor="address">Address</label>
        <textarea id="address" className="input" rows={2} {...register('address')} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" {...register('is_active')} /> Active
      </label>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={isSubmitting}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : initial ? 'Save changes' : 'Create warehouse'}
        </button>
      </div>
    </form>
  );
}

export function WarehousesPage() {
  const { warehouses, loading, createWarehouse, updateWarehouse, deactivateWarehouse } = useWarehouses();
  const { push } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Warehouse | null>(null);
  const [toDeactivate, setToDeactivate] = useState<Warehouse | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (v: WarehouseInput) => {
    const result = editing ? await updateWarehouse(editing.id, v) : await createWarehouse(v);
    if (!result.error) { push('success', editing ? 'Warehouse updated.' : 'Warehouse created.'); setFormOpen(false); }
    return result;
  };

  const handleDeactivate = async () => {
    if (!toDeactivate) return;
    setBusy(true);
    const { error } = await deactivateWarehouse(toDeactivate.id);
    setBusy(false);
    setToDeactivate(null);
    push(error ? 'error' : 'success', error ?? 'Warehouse deactivated.');
  };

  const columns: Column<Warehouse>[] = [
    {
      key: 'name', header: 'Warehouse', sortValue: (r) => r.name,
      render: (r) => (
        <Link to={`/warehouse/stock/${r.id}`} className="font-medium text-brand-700 hover:underline dark:text-brand-400">
          {r.name}
        </Link>
      ),
    },
    { key: 'code', header: 'Code' },
    { key: 'address', header: 'Address', render: (r) => r.address || '—' },
    { key: 'status', header: 'Status', render: (r) => <span className={r.is_active ? 'badge-green' : 'badge-slate'}>{r.is_active ? 'Active' : 'Inactive'}</span> },
    {
      key: 'actions', header: '', className: 'text-right',
      render: (r) => (
        <div className="flex justify-end gap-1">
          <PermissionGate permission="warehouse:edit">
            <button className="btn-ghost !px-2 !py-1" onClick={() => { setEditing(r); setFormOpen(true); }}><Pencil size={16} /></button>
          </PermissionGate>
          <PermissionGate permission="warehouse:delete">
            {r.is_active && <button className="btn-ghost !px-2 !py-1 text-red-600" onClick={() => setToDeactivate(r)}><Ban size={16} /></button>}
          </PermissionGate>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Warehouses</h1>
          <p className="text-sm text-slate-500">Click a warehouse to view live stock levels.</p>
        </div>
        <PermissionGate permission="warehouse:create">
          <button className="btn-primary" onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus size={16} /> New warehouse
          </button>
        </PermissionGate>
      </div>

      {warehouses.length === 0 && !loading ? (
        <div className="card flex flex-col items-center gap-3 p-12 text-center">
          <WarehouseIcon className="text-slate-300" size={40} />
          <p className="font-medium text-slate-600 dark:text-slate-300">No warehouses yet</p>
          <PermissionGate permission="warehouse:create">
            <button className="btn-primary" onClick={() => { setEditing(null); setFormOpen(true); }}><Plus size={16} /> New warehouse</button>
          </PermissionGate>
        </div>
      ) : (
        <DataTable columns={columns} rows={warehouses} rowKey={(r) => r.id} loading={loading}
          searchPlaceholder="Search warehouses…" searchFn={(r, q) => r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q)} />
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'Edit warehouse' : 'New warehouse'}>
        <WarehouseForm initial={editing} onSubmit={handleSubmit} onCancel={() => setFormOpen(false)} />
      </Modal>

      <ConfirmDialog
        open={!!toDeactivate}
        title="Deactivate warehouse"
        message={`"${toDeactivate?.name}" will no longer be selectable for transfers or loading. Existing stock records are kept.`}
        confirmLabel="Deactivate"
        loading={busy}
        onConfirm={handleDeactivate}
        onCancel={() => setToDeactivate(null)}
      />
    </div>
  );
}
