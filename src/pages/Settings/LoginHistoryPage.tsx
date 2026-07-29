import { useLoginHistory, LoginHistoryEntry } from '@/hooks/useLoginHistory';
import { DataTable, Column } from '@/components/ui/DataTable';

export function LoginHistoryPage() {
  const { entries, loading } = useLoginHistory();

  const columns: Column<LoginHistoryEntry>[] = [
    { key: 'user', header: 'User', render: (r) => r.user?.full_name ?? r.username_attempted },
    { key: 'username', header: 'Username attempted', render: (r) => r.username_attempted },
    { key: 'status', header: 'Result', render: (r) => (
      <span className={r.success ? 'badge-green' : 'badge-red'}>{r.success ? 'Success' : 'Failed'}</span>
    ) },
    { key: 'device', header: 'Device', render: (r) => r.device_info ?? '—' },
    { key: 'created_at', header: 'When', sortValue: (r) => r.created_at, render: (r) => new Date(r.created_at).toLocaleString() },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Login History</h1>
        <p className="text-sm text-slate-500">Every sign-in attempt across this company, most recent first.</p>
      </div>
      <DataTable
        columns={columns} rows={entries} rowKey={(r) => r.id} loading={loading}
        emptyMessage="No login attempts recorded yet." exportFilename="login-history"
      />
    </div>
  );
}
