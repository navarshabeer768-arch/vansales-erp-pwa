import { useState } from 'react';
import { Plus, UserCog, Copy, Check as CheckIcon } from 'lucide-react';
import { useStaff, useCompanyRoles, StaffMember } from '@/hooks/useStaff';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  let pw = '';
  for (let i = 0; i < 12; i++) pw += chars[Math.floor(Math.random() * chars.length)];
  return pw;
}

function NewStaffModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { createStaff } = useStaff();
  const roles = useCompanyRoles();
  const { push } = useToast();

  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const [roleId, setRoleId] = useState('');
  const [tempPassword, setTempPassword] = useState(generatePassword());
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const reset = () => {
    setFullName(''); setUsername(''); setPhone(''); setEmployeeCode(''); setRoleId('');
    setTempPassword(generatePassword()); setCreated(null);
  };

  const submit = async () => {
    if (!fullName.trim() || !username.trim() || !roleId || tempPassword.length < 8) {
      push('error', 'Full name, username, role, and an 8+ character password are required.');
      return;
    }
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(username.trim())) {
      push('error', 'Username must be 3-30 characters: letters, numbers, and underscores only.');
      return;
    }
    setSubmitting(true);
    const { error } = await createStaff({
      fullName: fullName.trim(), username: username.trim(), phone: phone.trim() || undefined,
      roleId, employeeCode: employeeCode.trim() || undefined, tempPassword,
    });
    setSubmitting(false);
    if (error) { push('error', error); return; }
    setCreated({ username: username.trim(), password: tempPassword });
    onCreated();
  };

  const copyCredentials = async () => {
    if (!created) return;
    await navigator.clipboard.writeText(`Username: ${created.username}\nPassword: ${created.password}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (created) {
    return (
      <Modal open={open} onClose={() => { reset(); onClose(); }} title="Staff account created" size="sm">
        <div className="space-y-4 text-center">
          <p className="text-sm text-slate-600 dark:text-slate-300">Share these login details (they'll also need your Store ID):</p>
          <div className="rounded-lg bg-slate-50 p-4 text-left text-sm dark:bg-slate-800">
            <p><span className="text-slate-500">Username:</span> <strong>{created.username}</strong></p>
            <p><span className="text-slate-500">Password:</span> {created.password}</p>
          </div>
          <p className="text-xs text-amber-600">This password won't be shown again — copy it now.</p>
          <div className="flex justify-center gap-2">
            <button className="btn-secondary" onClick={copyCredentials}>
              {copied ? <CheckIcon size={16} /> : <Copy size={16} />} {copied ? 'Copied' : 'Copy credentials'}
            </button>
            <button className="btn-primary" onClick={() => { reset(); onClose(); }}>Done</button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title="New staff account" size="sm">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Full name *</label>
            <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <label className="label">Username *</label>
            <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Phone</label>
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <label className="label">Employee code</label>
            <input className="input" value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">Role *</label>
          <select className="input" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            <option value="">Select a role…</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Temporary password *</label>
          <div className="flex gap-2">
            <input className="input" value={tempPassword} onChange={(e) => setTempPassword(e.target.value)} />
            <button type="button" className="btn-secondary shrink-0" onClick={() => setTempPassword(generatePassword())}>Regenerate</button>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={() => { reset(); onClose(); }} disabled={submitting}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={submitting}>
            {submitting ? 'Creating…' : 'Create account'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function StaffPage() {
  const { staff, loading, reload, updateStaffRole, setStaffActive } = useStaff();
  const roles = useCompanyRoles();
  const { push } = useToast();
  const [newOpen, setNewOpen] = useState(false);
  const [toDeactivate, setToDeactivate] = useState<StaffMember | null>(null);
  const [busy, setBusy] = useState(false);

  const handleRoleChange = async (staffId: string, roleId: string) => {
    const { error } = await updateStaffRole(staffId, roleId);
    push(error ? 'error' : 'success', error ?? 'Role updated.');
  };

  const handleDeactivate = async () => {
    if (!toDeactivate) return;
    setBusy(true);
    const { error } = await setStaffActive(toDeactivate.id, false);
    setBusy(false);
    setToDeactivate(null);
    push(error ? 'error' : 'success', error ?? 'Staff account deactivated.');
  };

  const handleReactivate = async (member: StaffMember) => {
    const { error } = await setStaffActive(member.id, true);
    push(error ? 'error' : 'success', error ?? 'Staff account reactivated.');
  };

  const columns: Column<StaffMember>[] = [
    { key: 'name', header: 'Name', sortValue: (r) => r.full_name, render: (r) => (
      <div><p className="font-medium">{r.full_name}</p><p className="text-xs text-slate-500">@{r.username}{r.employee_code ? ` · ${r.employee_code}` : ''}</p></div>
    ) },
    { key: 'phone', header: 'Phone', render: (r) => r.phone ?? '—' },
    {
      key: 'role', header: 'Role',
      render: (r) => (
        <PermissionGate permission="hr:edit" fallback={<span>{r.role?.name ?? '—'}</span>}>
          <select className="input !w-40 !py-1.5" value={r.role_id} onChange={(e) => handleRoleChange(r.id, e.target.value)}>
            {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
          </select>
        </PermissionGate>
      ),
    },
    { key: 'status', header: 'Status', render: (r) => <span className={r.is_active ? 'badge-green' : 'badge-slate'}>{r.is_active ? 'Active' : 'Inactive'}</span> },
    {
      key: 'actions', header: '', className: 'text-right',
      render: (r) => (
        <PermissionGate permission="hr:edit">
          {r.is_active ? (
            <button className="btn-ghost !py-1 text-red-600" onClick={() => setToDeactivate(r)}>Deactivate</button>
          ) : (
            <button className="btn-secondary !py-1" onClick={() => handleReactivate(r)}>Reactivate</button>
          )}
        </PermissionGate>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Staff Accounts</h1>
          <p className="text-sm text-slate-500">Everyone with a login to this company, their role, and status.</p>
        </div>
        <PermissionGate permission="hr:create">
          <button className="btn-primary" onClick={() => setNewOpen(true)}><Plus size={16} /> New staff account</button>
        </PermissionGate>
      </div>

      {staff.length === 0 && !loading ? (
        <div className="card flex flex-col items-center gap-2 p-10 text-center">
          <UserCog className="text-slate-300" size={36} />
          <p className="font-medium text-slate-600 dark:text-slate-300">No staff accounts yet</p>
        </div>
      ) : (
        <DataTable columns={columns} rows={staff} rowKey={(r) => r.id} loading={loading}
          searchPlaceholder="Search staff…" searchFn={(r, q) => r.full_name.toLowerCase().includes(q) || r.username.toLowerCase().includes(q)} />
      )}

      <NewStaffModal open={newOpen} onClose={() => setNewOpen(false)} onCreated={reload} />

      <ConfirmDialog
        open={!!toDeactivate}
        title="Deactivate staff account"
        message={`"${toDeactivate?.full_name}" will no longer be able to sign in. Their history (sales, approvals, etc.) is kept.`}
        confirmLabel="Deactivate"
        loading={busy}
        onConfirm={handleDeactivate}
        onCancel={() => setToDeactivate(null)}
      />
    </div>
  );
}
