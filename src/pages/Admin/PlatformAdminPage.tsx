import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { ShieldCheck, Check, Ban } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useAllCompanies, CompanyRow } from '@/hooks/useAllCompanies';
import { DataTable, Column } from '@/components/ui/DataTable';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/contexts/ToastContext';

export function PlatformAdminPage() {
  const { isPlatformAdmin, loading: authLoading } = useAuth();
  const { companies, loading, approve, suspend } = useAllCompanies();
  const { push } = useToast();
  const [toApprove, setToApprove] = useState<CompanyRow | null>(null);
  const [toSuspend, setToSuspend] = useState<CompanyRow | null>(null);
  const [busy, setBusy] = useState(false);

  if (!authLoading && !isPlatformAdmin) return <Navigate to="/" replace />;

  const handleApprove = async () => {
    if (!toApprove) return;
    setBusy(true);
    const { error } = await approve(toApprove.id);
    setBusy(false);
    setToApprove(null);
    push(error ? 'error' : 'success', error ?? `${toApprove.name} approved.`);
  };

  const handleSuspend = async () => {
    if (!toSuspend) return;
    setBusy(true);
    const { error } = await suspend(toSuspend.id);
    setBusy(false);
    setToSuspend(null);
    push(error ? 'error' : 'success', error ?? `${toSuspend.name} suspended.`);
  };

  const statusBadge = (c: CompanyRow) => {
    if (!c.is_active) return <span className="badge-amber">Pending</span>;
    if (c.subscription_status === 'suspended') return <span className="badge-red">Suspended</span>;
    return <span className="badge-green">Active</span>;
  };

  const columns: Column<CompanyRow>[] = [
    { key: 'name', header: 'Company', sortValue: (r) => r.name, render: (r) => (
      <div><p className="font-medium">{r.name}</p><p className="text-xs text-slate-500">{r.slug}</p></div>
    ) },
    { key: 'phone', header: 'Phone', render: (r) => r.phone ?? '—' },
    { key: 'currency', header: 'Currency' },
    { key: 'status', header: 'Status', render: statusBadge },
    { key: 'created_at', header: 'Registered', render: (r) => new Date(r.created_at).toLocaleString() },
    {
      key: 'actions', header: '', className: 'text-right',
      render: (r) => (
        <div className="flex justify-end gap-1">
          {!r.is_active && (
            <button className="btn-primary !py-1" onClick={() => setToApprove(r)}><Check size={14} /> Approve</button>
          )}
          {r.is_active && (
            <button className="btn-secondary !py-1 text-red-600" onClick={() => setToSuspend(r)}><Ban size={14} /> Suspend</button>
          )}
        </div>
      ),
    },
  ];

  const pendingCount = companies.filter((c) => !c.is_active).length;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-700 text-white">
          <ShieldCheck size={20} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Platform Admin</h1>
          <p className="text-sm text-slate-500">
            {pendingCount > 0 ? `${pendingCount} registration${pendingCount === 1 ? '' : 's'} awaiting approval` : 'All companies reviewed'}
          </p>
        </div>
      </div>

      <DataTable
        columns={columns} rows={companies} rowKey={(r) => r.id} loading={loading}
        searchPlaceholder="Search companies…" searchFn={(r, q) => r.name.toLowerCase().includes(q)}
      />

      <ConfirmDialog
        open={!!toApprove}
        title="Approve company"
        message={`"${toApprove?.name}" will get full access to the app immediately.`}
        confirmLabel="Approve"
        danger={false}
        loading={busy}
        onConfirm={handleApprove}
        onCancel={() => setToApprove(null)}
      />
      <ConfirmDialog
        open={!!toSuspend}
        title="Suspend company"
        message={`"${toSuspend?.name}" will immediately lose access to the app until re-approved.`}
        confirmLabel="Suspend"
        loading={busy}
        onConfirm={handleSuspend}
        onCancel={() => setToSuspend(null)}
      />
    </div>
  );
}
