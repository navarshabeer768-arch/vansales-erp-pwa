import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Ban, Eye, Plus } from 'lucide-react';
import { useAllCompanies, CompanyRow } from '@/hooks/useAllCompanies';
import { DataTable, Column } from '@/components/ui/DataTable';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/contexts/ToastContext';
import { NewCompanyModal } from './NewCompanyModal';

export function PlatformCompaniesPage() {
  const { companies, loading, approve, suspend, reload } = useAllCompanies();
  const { push } = useToast();
  const [toApprove, setToApprove] = useState<CompanyRow | null>(null);
  const [toSuspend, setToSuspend] = useState<CompanyRow | null>(null);
  const [newCompanyOpen, setNewCompanyOpen] = useState(false);
  const [busy, setBusy] = useState(false);

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
    { key: 'plan', header: 'Plan', render: (r) => <span className="capitalize">{r.subscription_plan}</span> },
    { key: 'currency', header: 'Currency' },
    { key: 'status', header: 'Status', render: statusBadge },
    { key: 'created_at', header: 'Registered', render: (r) => new Date(r.created_at).toLocaleString() },
    {
      key: 'actions', header: '', className: 'text-right',
      render: (r) => (
        <div className="flex justify-end gap-1">
          <Link to={`/platform-admin/companies/${r.id}`} className="btn-ghost !px-2 !py-1"><Eye size={16} /></Link>
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Companies</h1>
          <p className="text-sm text-slate-500">
            {pendingCount > 0 ? `${pendingCount} registration${pendingCount === 1 ? '' : 's'} awaiting approval` : 'All companies reviewed'}
          </p>
        </div>
        <button className="btn-primary" onClick={() => setNewCompanyOpen(true)}>
          <Plus size={16} /> New company
        </button>
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

      <NewCompanyModal open={newCompanyOpen} onClose={() => setNewCompanyOpen(false)} onCreated={reload} />
    </div>
  );
}
