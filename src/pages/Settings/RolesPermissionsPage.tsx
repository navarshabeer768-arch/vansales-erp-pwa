import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useCompanyRoles } from '@/hooks/useStaff';
import { usePermissionCatalog, useRolePermissions } from '@/hooks/useRolePermissions';
import { useToast } from '@/contexts/ToastContext';

const MODULE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard', sales: 'Sales', van_loading: 'Van Loading', van_unloading: 'Van Unloading',
  route_planning: 'Route Planning', customer_visit: 'Customer Visit', inventory: 'Inventory',
  warehouse: 'Warehouse', purchases: 'Purchases', payments: 'Payments', collections: 'Collections',
  returns: 'Returns', accounting: 'Accounting', reports: 'Reports', hr: 'HR',
  gps_tracking: 'GPS Tracking', settings: 'Settings',
};
const ACTIONS = ['view', 'create', 'edit', 'delete', 'approve', 'export'] as const;

export function RolesPermissionsPage() {
  const roles = useCompanyRoles();
  const permissions = usePermissionCatalog();
  const { push } = useToast();
  const [roleId, setRoleId] = useState('');
  const { grantedIds, loading, toggle } = useRolePermissions(roleId || null);

  const selectedRole = roles.find((r) => r.id === roleId);
  const isSystemAdmin = selectedRole?.code === 'super_admin' || selectedRole?.code === 'company_admin';

  const modules = Array.from(new Set(permissions.map((p) => p.module)));

  const permissionFor = (module: string, action: string) =>
    permissions.find((p) => p.module === module && p.action === action);

  const handleToggle = async (module: string, action: string, currentlyGranted: boolean) => {
    const perm = permissionFor(module, action);
    if (!perm) return;
    const { error } = await toggle(perm.id, !currentlyGranted);
    if (error) push('error', error);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-700 text-white">
          <ShieldCheck size={20} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Roles &amp; Permissions</h1>
          <p className="text-sm text-slate-500">Choose a role, then toggle exactly what it can see and do.</p>
        </div>
      </div>

      <div className="card p-4">
        <label className="label">Role</label>
        <select className="input max-w-xs" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
          <option value="">Select a role…</option>
          {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </div>

      {isSystemAdmin && (
        <div className="card border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-900/20 dark:text-amber-400">
          {selectedRole?.name} always has full access to every module — this can't be narrowed, since at least one role in every company needs guaranteed full access to avoid ever locking everyone out.
        </div>
      )}

      {roleId && !isSystemAdmin && (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Module</th>
                {ACTIONS.map((a) => <th key={a} className="text-center capitalize">{a}</th>)}
              </tr>
            </thead>
            <tbody>
              {modules.map((module) => (
                <tr key={module}>
                  <td className="font-medium">{MODULE_LABELS[module] ?? module}</td>
                  {ACTIONS.map((action) => {
                    const perm = permissionFor(module, action);
                    if (!perm) return <td key={action} className="text-center text-slate-300">—</td>;
                    const granted = grantedIds.has(perm.id);
                    return (
                      <td key={action} className="text-center">
                        <input
                          type="checkbox" checked={granted} disabled={loading}
                          onChange={() => handleToggle(module, action, granted)}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
