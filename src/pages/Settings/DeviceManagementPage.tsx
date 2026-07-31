import { useState, useEffect } from 'react';
import { Smartphone, Pencil, Trash2, Wifi, WifiOff } from 'lucide-react';
import { useDevices, fetchDeviceSessions, DeviceSession, Device } from '@/hooks/useDevices';
import { useAssignableStaff } from '@/hooks/useVanAssignments';
import { useVans } from '@/hooks/useVans';
import { useWarehouses } from '@/hooks/useWarehouses';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';

function AssignModal({ device, onClose, onSaved }: { device: Device | null; onClose: () => void; onSaved: () => void }) {
  const staff = useAssignableStaff();
  const { vans } = useVans();
  const { warehouses } = useWarehouses();
  const { assignDevice, renameDevice } = useDevices();
  const { push } = useToast();

  const [name, setName] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [vanId, setVanId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (device) {
      setName(device.device_name);
      setEmployeeId(device.assigned_employee_id ?? '');
      setVanId(device.assigned_van_id ?? '');
      setWarehouseId(device.assigned_warehouse_id ?? '');
    }
  }, [device]);

  const submit = async () => {
    if (!device) return;
    setSaving(true);
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      renameDevice(device.id, name),
      assignDevice(device.id, { employeeId: employeeId || null, vanId: vanId || null, warehouseId: warehouseId || null }),
    ]);
    setSaving(false);
    const error = e1 || e2;
    push(error ? 'error' : 'success', error ?? 'Device updated.');
    if (!error) { onSaved(); onClose(); }
  };

  return (
    <Modal open={!!device} onClose={onClose} title="Device details" size="sm">
      {device && (
        <div className="space-y-4">
          <div>
            <label className="label">Device name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800">
            <p>Model: {device.device_model ?? 'Unknown'}</p>
            <p>Manufacturer: {device.manufacturer ?? 'Unknown'}</p>
            <p>OS: {device.os_version ?? 'Unknown'}</p>
          </div>
          <div>
            <label className="label">Assigned employee</label>
            <select className="input" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">— None —</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Assigned van</label>
            <select className="input" value={vanId} onChange={(e) => setVanId(e.target.value)}>
              <option value="">— None —</option>
              {vans.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Assigned branch (warehouse)</label>
            <select className="input" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              <option value="">— None —</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="btn-primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function DeviceLogsModal({ device, onClose }: { device: Device | null; onClose: () => void }) {
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  useEffect(() => { if (device) fetchDeviceSessions(device.id).then(setSessions); }, [device]);

  return (
    <Modal open={!!device} onClose={onClose} title={device ? `Login history — ${device.device_name}` : ''} size="lg">
      <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="table-base">
          <thead><tr><th>Employee</th><th>Login</th><th>Logout</th></tr></thead>
          <tbody>
            {sessions.length === 0 ? (
              <tr><td colSpan={3} className="py-8 text-center text-slate-400">No login history yet.</td></tr>
            ) : sessions.map((s) => (
              <tr key={s.id}>
                <td>{s.employee?.full_name ?? '—'}</td>
                <td>{new Date(s.login_at).toLocaleString()}</td>
                <td>{s.logout_at ? new Date(s.logout_at).toLocaleString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

export function DeviceManagementPage() {
  const { devices, loading, reload, setStatus, removeDevice } = useDevices();
  const { push } = useToast();
  const [editing, setEditing] = useState<Device | null>(null);
  const [viewingLogs, setViewingLogs] = useState<Device | null>(null);
  const [toRemove, setToRemove] = useState<Device | null>(null);
  const [busy, setBusy] = useState(false);

  const handleToggleStatus = async (d: Device) => {
    const next = d.status === 'active' ? 'blocked' : 'active';
    const { error } = await setStatus(d.id, next);
    push(error ? 'error' : 'success', error ?? `Device ${next === 'active' ? 'unblocked' : 'blocked'}.`);
  };

  const handleRemove = async () => {
    if (!toRemove) return;
    setBusy(true);
    const { error } = await removeDevice(toRemove.id);
    setBusy(false);
    setToRemove(null);
    push(error ? 'error' : 'success', error ?? 'Device removed.');
  };

  const columns: Column<Device>[] = [
    { key: 'name', header: 'Device', sortValue: (r) => r.device_name, render: (r) => (
      <div>
        <p className="font-medium">{r.device_name}</p>
        <p className="text-xs text-slate-500">{r.manufacturer ?? 'Unknown'} {r.device_model ?? ''}</p>
      </div>
    ) },
    { key: 'assigned', header: 'Assigned to', render: (r) => (
      <div className="text-xs">
        <p>{r.employee?.full_name ?? '—'}</p>
        <p className="text-slate-500">{[r.van?.name, r.warehouse?.name].filter(Boolean).join(' · ') || '—'}</p>
      </div>
    ) },
    { key: 'os', header: 'OS', render: (r) => r.os_version ?? '—' },
    { key: 'last_login', header: 'Last login', sortValue: (r) => r.last_login_at ?? '', render: (r) => r.last_login_at ? new Date(r.last_login_at).toLocaleString() : '—' },
    { key: 'last_sync', header: 'Last sync', render: (r) => r.last_sync_at ? new Date(r.last_sync_at).toLocaleString() : '—' },
    { key: 'status', header: 'Status', render: (r) => (
      <span className={r.status === 'active' ? 'badge-green' : r.status === 'blocked' ? 'badge-red' : 'badge-slate'}>{r.status}</span>
    ) },
    {
      key: 'actions', header: '', className: 'text-right',
      render: (r) => (
        <div className="flex justify-end gap-1">
          <PermissionGate permission="devices:assign">
            <button className="btn-ghost !px-2 !py-1" onClick={() => setEditing(r)}><Pencil size={14} /></button>
          </PermissionGate>
          <button className="btn-ghost !px-2 !py-1" onClick={() => setViewingLogs(r)}>Logs</button>
          <PermissionGate permission="devices:manage">
            <button className="btn-ghost !px-2 !py-1" onClick={() => handleToggleStatus(r)}>
              {r.status === 'active' ? <WifiOff size={14} /> : <Wifi size={14} />}
            </button>
          </PermissionGate>
          <PermissionGate permission="devices:delete">
            <button className="btn-ghost !px-2 !py-1 text-red-600" onClick={() => setToRemove(r)}><Trash2 size={14} /></button>
          </PermissionGate>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Device Management</h1>
        <p className="text-sm text-slate-500">
          Devices register themselves automatically on first sign-in — no manual "add device" step. Rename, assign,
          block, or remove them here.
        </p>
      </div>

      {devices.length === 0 && !loading ? (
        <div className="card flex flex-col items-center gap-2 p-10 text-center">
          <Smartphone className="text-slate-300" size={36} />
          <p className="text-sm text-slate-500">No devices have signed in yet.</p>
        </div>
      ) : (
        <DataTable columns={columns} rows={devices} rowKey={(r) => r.id} loading={loading} exportFilename="devices"
          searchPlaceholder="Search devices…" searchFn={(r, q) => r.device_name.toLowerCase().includes(q)} />
      )}

      <AssignModal device={editing} onClose={() => setEditing(null)} onSaved={reload} />
      <DeviceLogsModal device={viewingLogs} onClose={() => setViewingLogs(null)} />

      <ConfirmDialog
        open={!!toRemove}
        title="Remove device"
        message={`"${toRemove?.device_name}" will be removed from the device registry. It can re-register automatically the next time it signs in.`}
        confirmLabel="Remove"
        loading={busy}
        onConfirm={handleRemove}
        onCancel={() => setToRemove(null)}
      />
    </div>
  );
}
