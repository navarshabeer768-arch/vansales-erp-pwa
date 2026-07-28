import { useState, useEffect } from 'react';
import { Plus, Pencil, Ban, Users, Trash2, MapPin } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRoutes, useRouteCustomers, RouteRow, RouteInput } from '@/hooks/useRoutes';
import { useVans, useSalesmenAndDrivers } from '@/hooks/useVans';
import { useCustomers } from '@/hooks/useCustomers';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';

const schema = z.object({
  code: z.string().min(1, 'Code is required').max(20),
  name: z.string().min(1, 'Name is required').max(150),
  frequency: z.enum(['daily', 'weekly', 'monthly']),
  van_id: z.string().optional().or(z.literal('')),
  salesman_id: z.string().optional().or(z.literal('')),
  is_active: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

function RouteForm({ initial, onSubmit, onCancel }: {
  initial?: RouteRow | null;
  onSubmit: (v: RouteInput) => Promise<{ error: string | null }>;
  onCancel: () => void;
}) {
  const { vans } = useVans();
  const { salesmen } = useSalesmenAndDrivers();
  const { register, handleSubmit, reset, formState: { errors, isSubmitting }, setError } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { code: '', name: '', frequency: 'daily', van_id: '', salesman_id: '', is_active: true },
  });

  useEffect(() => {
    if (initial) {
      reset({
        code: initial.code, name: initial.name, frequency: initial.frequency,
        van_id: initial.van_id ?? '', salesman_id: initial.salesman_id ?? '', is_active: initial.is_active,
      });
    }
  }, [initial, reset]);

  const submit = async (v: FormValues) => {
    const { error } = await onSubmit({
      code: v.code, name: v.name, frequency: v.frequency,
      van_id: v.van_id || null, salesman_id: v.salesman_id || null, is_active: v.is_active,
    });
    if (error) setError('code', { message: error });
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Code *</label>
          <input className="input" {...register('code')} />
          {errors.code && <p className="error-text">{errors.code.message}</p>}
        </div>
        <div>
          <label className="label">Name *</label>
          <input className="input" {...register('name')} />
          {errors.name && <p className="error-text">{errors.name.message}</p>}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="label">Frequency</label>
          <select className="input" {...register('frequency')}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
        <div>
          <label className="label">Van</label>
          <select className="input" {...register('van_id')}>
            <option value="">— None —</option>
            {vans.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Salesman</label>
          <select className="input" {...register('salesman_id')}>
            <option value="">— None —</option>
            {salesmen.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" {...register('is_active')} /> Active
      </label>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={isSubmitting}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : initial ? 'Save changes' : 'Create route'}
        </button>
      </div>
    </form>
  );
}

function ManageCustomersModal({ route, onClose }: { route: RouteRow | null; onClose: () => void }) {
  const { assignments, loading, addCustomer, updateSequence, removeCustomer } = useRouteCustomers(route?.id ?? null);
  const { customers } = useCustomers();
  const { push } = useToast();

  const availableCustomers = customers.filter((c) => !assignments.some((a) => a.customer_id === c.id));

  return (
    <Modal open={!!route} onClose={onClose} title={route ? `Customers on ${route.name}` : ''} size="lg">
      <div className="space-y-4">
        <div>
          <label className="label">Add customer to this route</label>
          <select className="input" value="" onChange={async (e) => {
            if (!e.target.value) return;
            const { error } = await addCustomer(e.target.value);
            push(error ? 'error' : 'success', error ?? 'Customer added to route.');
          }}>
            <option value="">Select a customer…</option>
            {availableCustomers.map((c) => <option key={c.id} value={c.id}>{c.business_name}</option>)}
          </select>
        </div>

        {loading ? (
          <p className="text-center text-slate-400">Loading…</p>
        ) : assignments.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">No customers assigned to this route yet.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="table-base">
              <thead><tr><th>Seq.</th><th>Customer</th><th>Address</th><th></th></tr></thead>
              <tbody>
                {assignments.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <input
                        type="number" min={1} className="input !w-16 !py-1.5" value={a.visit_sequence}
                        onChange={(e) => updateSequence(a.id, Number(e.target.value))}
                      />
                    </td>
                    <td className="font-medium">{a.customer?.business_name}</td>
                    <td className="text-slate-500">{a.customer?.address ?? '—'}</td>
                    <td><button onClick={() => removeCustomer(a.id)} className="text-slate-400 hover:text-red-600"><Trash2 size={16} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}

export function RoutesPage() {
  const { routes, loading, createRoute, updateRoute, deactivateRoute } = useRoutes();
  const { push } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RouteRow | null>(null);
  const [managing, setManaging] = useState<RouteRow | null>(null);
  const [toDeactivate, setToDeactivate] = useState<RouteRow | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (v: RouteInput) => {
    const result = editing ? await updateRoute(editing.id, v) : await createRoute(v);
    if (!result.error) { push('success', editing ? 'Route updated.' : 'Route created.'); setFormOpen(false); }
    return result;
  };

  const handleDeactivate = async () => {
    if (!toDeactivate) return;
    setBusy(true);
    const { error } = await deactivateRoute(toDeactivate.id);
    setBusy(false);
    setToDeactivate(null);
    push(error ? 'error' : 'success', error ?? 'Route deactivated.');
  };

  const columns: Column<RouteRow>[] = [
    { key: 'name', header: 'Route', sortValue: (r) => r.name, render: (r) => (
      <div><p className="font-medium">{r.name}</p><p className="text-xs text-slate-500">{r.code}</p></div>
    ) },
    { key: 'frequency', header: 'Frequency', render: (r) => <span className="capitalize">{r.frequency}</span> },
    { key: 'van', header: 'Van', render: (r) => r.van?.name ?? '—' },
    { key: 'salesman', header: 'Salesman', render: (r) => r.salesman?.full_name ?? '—' },
    { key: 'status', header: 'Status', render: (r) => <span className={r.is_active ? 'badge-green' : 'badge-slate'}>{r.is_active ? 'Active' : 'Inactive'}</span> },
    {
      key: 'actions', header: '', className: 'text-right',
      render: (r) => (
        <div className="flex justify-end gap-1">
          <button className="btn-ghost !px-2 !py-1" onClick={() => setManaging(r)} title="Manage customers"><Users size={16} /></button>
          <PermissionGate permission="route_planning:edit">
            <button className="btn-ghost !px-2 !py-1" onClick={() => { setEditing(r); setFormOpen(true); }}><Pencil size={16} /></button>
          </PermissionGate>
          <PermissionGate permission="route_planning:delete">
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
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Routes</h1>
          <p className="text-sm text-slate-500">Assign customers and sequence to build a salesman's daily round.</p>
        </div>
        <PermissionGate permission="route_planning:create">
          <button className="btn-primary" onClick={() => { setEditing(null); setFormOpen(true); }}><Plus size={16} /> New route</button>
        </PermissionGate>
      </div>

      {routes.length === 0 && !loading ? (
        <div className="card flex flex-col items-center gap-3 p-12 text-center">
          <MapPin className="text-slate-300" size={40} />
          <p className="font-medium text-slate-600 dark:text-slate-300">No routes yet</p>
          <PermissionGate permission="route_planning:create">
            <button className="btn-primary" onClick={() => { setEditing(null); setFormOpen(true); }}><Plus size={16} /> New route</button>
          </PermissionGate>
        </div>
      ) : (
        <DataTable columns={columns} rows={routes} rowKey={(r) => r.id} loading={loading}
          searchPlaceholder="Search routes…" searchFn={(r, q) => r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q)} />
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'Edit route' : 'New route'}>
        <RouteForm initial={editing} onSubmit={handleSubmit} onCancel={() => setFormOpen(false)} />
      </Modal>

      <ManageCustomersModal route={managing} onClose={() => setManaging(null)} />

      <ConfirmDialog
        open={!!toDeactivate}
        title="Deactivate route"
        message={`"${toDeactivate?.name}" will no longer appear for planning today's visits. History is kept.`}
        confirmLabel="Deactivate"
        loading={busy}
        onConfirm={handleDeactivate}
        onCancel={() => setToDeactivate(null)}
      />
    </div>
  );
}
