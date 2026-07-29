import { useVanStaffHistory, useVanStaffRoles } from '@/hooks/useVanAssignments';
import { DataTable, Column } from '@/components/ui/DataTable';
import type { VanStaffHistoryRow } from '@/hooks/useVanAssignments';

export function VanStaffReportPage() {
  const { rows, loading } = useVanStaffHistory();
  const { roles } = useVanStaffRoles();
  const roleLabel = (code: string) => roles.find((r) => r.code === code)?.label ?? code;

  const columns: Column<VanStaffHistoryRow>[] = [
    { key: 'van', header: 'Van', sortValue: (r) => r.van_name, render: (r) => <span className="font-medium">{r.van_name}</span> },
    { key: 'employee', header: 'Employee', sortValue: (r) => r.employee_name, render: (r) => r.employee_name },
    { key: 'role', header: 'Role', render: (r) => roleLabel(r.role_code) },
    { key: 'primary', header: 'Primary', render: (r) => r.is_primary ? <span className="badge-amber">Primary</span> : '—' },
    { key: 'assigned', header: 'Assigned', sortValue: (r) => r.assigned_date, render: (r) => r.assigned_date },
    { key: 'removed', header: 'Removed', render: (r) => r.removed_date ?? '—' },
    { key: 'status', header: 'Status', render: (r) => <span className={r.status === 'active' ? 'badge-green' : 'badge-slate'}>{r.status}</span> },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Van Staff Report</h1>
        <p className="text-sm text-slate-500">
          Every van/employee/role assignment, past and present — covers Van Staff, Employee Assignment,
          Role Assignment, and Assignment History reporting in one filterable, exportable view.
        </p>
      </div>

      <DataTable
        columns={columns} rows={rows} rowKey={(r) => r.id} loading={loading} exportFilename="van-staff-report"
        searchPlaceholder="Search van or employee…"
        searchFn={(r, q) => r.van_name.toLowerCase().includes(q) || r.employee_name.toLowerCase().includes(q) || r.role_code.toLowerCase().includes(q)}
      />
    </div>
  );
}
