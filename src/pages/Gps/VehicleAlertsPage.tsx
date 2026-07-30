import { useEffect } from 'react';
import { RefreshCw, Check, AlertTriangle } from 'lucide-react';
import { useVehicleAlerts } from '@/hooks/useVehicleAlerts';
import { DataTable, Column } from '@/components/ui/DataTable';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';
import type { VehicleAlert } from '@/hooks/useVehicleAlerts';

const TYPE_LABELS: Record<string, string> = {
  maintenance_due: 'Maintenance Due', fuel_consumption: 'Fuel Consumption', vehicle_offline: 'Vehicle Offline',
  gps_lost: 'GPS Lost', permit_expiry: 'Permit Expiry', insurance_expiry: 'Insurance Expiry',
  registration_expiry: 'Registration Expiry', license_expiry: 'License Expiry', unauthorized_movement: 'Unauthorized Movement',
};

export function VehicleAlertsPage() {
  const { alerts, loading, refreshing, refresh, acknowledge, unacknowledgedCount } = useVehicleAlerts();
  const { push } = useToast();

  // Recompute current alerts as soon as this page loads — there's no
  // background server here to run a cron, so "on page load" is when it happens.
  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAcknowledge = async (id: string) => {
    const { error } = await acknowledge(id);
    push(error ? 'error' : 'success', error ?? 'Alert acknowledged.');
  };

  const severityBadge = (s: VehicleAlert['severity']) => s === 'critical' ? 'badge-red' : s === 'warning' ? 'badge-amber' : 'badge-slate';

  const columns: Column<VehicleAlert>[] = [
    { key: 'severity', header: 'Severity', render: (r) => <span className={severityBadge(r.severity)}>{r.severity}</span> },
    { key: 'type', header: 'Type', render: (r) => TYPE_LABELS[r.alert_type] ?? r.alert_type },
    { key: 'van', header: 'Van', render: (r) => r.van?.name ?? '—' },
    { key: 'message', header: 'Message', render: (r) => r.message },
    { key: 'when', header: 'Raised', sortValue: (r) => r.created_at, render: (r) => new Date(r.created_at).toLocaleString() },
    {
      key: 'actions', header: '', className: 'text-right',
      render: (r) => !r.is_acknowledged && (
        <PermissionGate permission="gps_tracking:edit">
          <button className="btn-secondary !py-1" onClick={() => handleAcknowledge(r.id)}><Check size={14} /> Acknowledge</button>
        </PermissionGate>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">
            Vehicle Alerts {unacknowledgedCount > 0 && <span className="ml-1 text-red-600">({unacknowledgedCount})</span>}
          </h1>
          <p className="text-sm text-slate-500">
            Maintenance due, document expiry, offline vans, unauthorized movement. Recomputed each time this page loads
            (no background job runs this automatically — there's no server to run one).
          </p>
        </div>
        <button className="btn-secondary" onClick={refresh} disabled={refreshing}>
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} /> {refreshing ? 'Checking…' : 'Refresh'}
        </button>
      </div>

      {alerts.length === 0 && !loading ? (
        <div className="card flex flex-col items-center gap-2 p-10 text-center">
          <AlertTriangle className="text-slate-300" size={36} />
          <p className="text-sm text-slate-500">No alerts — everything looks current.</p>
        </div>
      ) : (
        <DataTable columns={columns} rows={alerts} rowKey={(r) => r.id} loading={loading} exportFilename="vehicle-alerts" />
      )}
    </div>
  );
}
