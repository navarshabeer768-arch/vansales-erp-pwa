import { usePlatformStaff, PlatformStaffMember } from '@/hooks/usePlatformOverview';
import { DataTable, Column } from '@/components/ui/DataTable';

export function PlatformStaffPage() {
  const { staff, loading } = usePlatformStaff();

  const columns: Column<PlatformStaffMember>[] = [
    { key: 'full_name', header: 'Name', sortValue: (r) => r.full_name, render: (r) => <span className="font-medium">{r.full_name}</span> },
    { key: 'email', header: 'Email' },
    { key: 'company', header: 'Company', sortValue: (r) => r.company?.name ?? '', render: (r) => r.company?.name ?? '—' },
    { key: 'role', header: 'Role', render: (r) => r.role?.name ?? '—' },
    { key: 'status', header: 'Status', render: (r) => <span className={r.is_active ? 'badge-green' : 'badge-slate'}>{r.is_active ? 'Active' : 'Inactive'}</span> },
    { key: 'created_at', header: 'Joined', render: (r) => new Date(r.created_at).toLocaleDateString() },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Staff Accounts</h1>
        <p className="text-sm text-slate-500">Every staff account across every company on the platform.</p>
      </div>

      <DataTable
        columns={columns} rows={staff} rowKey={(r) => r.id} loading={loading}
        searchPlaceholder="Search staff, company, or email…"
        searchFn={(r, q) => r.full_name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q) || (r.company?.name ?? '').toLowerCase().includes(q)}
        emptyMessage="No staff accounts yet."
      />
    </div>
  );
}
