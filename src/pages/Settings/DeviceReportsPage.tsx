import { useState } from 'react';
import {
  useDeviceLoginReport, useSyncHistoryReport, usePrintLogReport, useOfflineActivityReport,
  DeviceLoginRow, SyncHistoryRow, PrintLogRow, OfflineTransactionRow,
} from '@/hooks/useDeviceReports';
import { DataTable, Column } from '@/components/ui/DataTable';

type Tab = 'logins' | 'sync' | 'print' | 'offline';

export function DeviceReportsPage() {
  const [tab, setTab] = useState<Tab>('logins');
  const { rows: logins, loading: loadingLogins } = useDeviceLoginReport();
  const { rows: syncRows, loading: loadingSync } = useSyncHistoryReport();
  const { rows: printRows, loading: loadingPrint } = usePrintLogReport();
  const { rows: offlineRows, loading: loadingOffline } = useOfflineActivityReport();

  const loginColumns: Column<DeviceLoginRow>[] = [
    { key: 'device', header: 'Device', render: (r) => r.device?.device_name ?? '—' },
    { key: 'employee', header: 'Employee', render: (r) => r.employee?.full_name ?? '—' },
    { key: 'login', header: 'Login', sortValue: (r) => r.login_at, render: (r) => new Date(r.login_at).toLocaleString() },
    { key: 'logout', header: 'Logout', render: (r) => r.logout_at ? new Date(r.logout_at).toLocaleString() : '—' },
  ];

  const syncColumns: Column<SyncHistoryRow>[] = [
    { key: 'entity', header: 'Entity', render: (r) => r.entity_type },
    { key: 'device', header: 'Device', render: (r) => r.device?.device_name ?? '—' },
    { key: 'employee', header: 'Employee', render: (r) => r.employee?.full_name ?? '—' },
    { key: 'synced', header: 'Synced', render: (r) => r.records_synced },
    { key: 'failed', header: 'Failed', render: (r) => r.records_failed },
    { key: 'status', header: 'Status', render: (r) => (
      <span className={r.status === 'success' ? 'badge-green' : r.status === 'failed' ? 'badge-red' : 'badge-amber'}>{r.status}</span>
    ) },
    { key: 'started', header: 'Started', sortValue: (r) => r.started_at, render: (r) => new Date(r.started_at).toLocaleString() },
  ];

  const printColumns: Column<PrintLogRow>[] = [
    { key: 'doc', header: 'Document', render: (r) => <span className="capitalize">{r.document_type.replace(/_/g, ' ')}</span> },
    { key: 'printer', header: 'Printer', render: (r) => <span className="capitalize">{r.printer_type.replace(/_/g, ' ')}</span> },
    { key: 'copies', header: 'Copies', render: (r) => r.copies },
    { key: 'employee', header: 'Employee', render: (r) => r.employee?.full_name ?? '—' },
    { key: 'when', header: 'When', sortValue: (r) => r.created_at, render: (r) => new Date(r.created_at).toLocaleString() },
  ];

  const offlineColumns: Column<OfflineTransactionRow>[] = [
    { key: 'entity', header: 'Entity', render: (r) => r.entity_type },
    { key: 'action', header: 'Action', render: (r) => <span className="capitalize">{r.action}</span> },
    { key: 'device', header: 'Device', render: (r) => r.device?.device_name ?? '—' },
    { key: 'employee', header: 'Employee', render: (r) => r.employee?.full_name ?? '—' },
    { key: 'status', header: 'Status', render: (r) => (
      <span className={r.status === 'synced' ? 'badge-green' : r.status === 'failed' || r.status === 'conflict' ? 'badge-red' : 'badge-amber'}>{r.status}</span>
    ) },
    { key: 'created_offline', header: 'Created offline', sortValue: (r) => r.offline_created_at, render: (r) => new Date(r.offline_created_at).toLocaleString() },
    { key: 'synced_at', header: 'Synced', render: (r) => r.synced_at ? new Date(r.synced_at).toLocaleString() : '—' },
  ];

  const tabs: { key: Tab; label: string }[] = [
    { key: 'logins', label: 'Device Login Report' },
    { key: 'sync', label: 'Sync Report' },
    { key: 'print', label: 'Print Report' },
    { key: 'offline', label: 'Offline Activity Report' },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Device &amp; Sync Reports</h1>
        <p className="text-sm text-slate-500">
          Device and Scan reports live alongside their own pages (Settings → Devices export; Inventory → Quick Scan).
          These four cover login history, sync activity, print activity, and offline transaction activity.
        </p>
      </div>

      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {tabs.map((t) => (
          <button
            key={t.key} onClick={() => setTab(t.key)}
            className={`border-b-2 px-4 py-2 text-sm font-medium ${tab === t.key ? 'border-brand-700 text-brand-700 dark:text-brand-400' : 'border-transparent text-slate-500'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'logins' && <DataTable columns={loginColumns} rows={logins} rowKey={(r) => r.id} loading={loadingLogins} exportFilename="device-login-report" />}
      {tab === 'sync' && <DataTable columns={syncColumns} rows={syncRows} rowKey={(r) => r.id} loading={loadingSync} exportFilename="sync-report" emptyMessage="No sync activity logged yet." />}
      {tab === 'print' && <DataTable columns={printColumns} rows={printRows} rowKey={(r) => r.id} loading={loadingPrint} exportFilename="print-report" />}
      {tab === 'offline' && <DataTable columns={offlineColumns} rows={offlineRows} rowKey={(r) => r.id} loading={loadingOffline} exportFilename="offline-activity-report" emptyMessage="No offline transactions logged yet." />}
    </div>
  );
}
