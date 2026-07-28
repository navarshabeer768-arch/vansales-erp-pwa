import { useState } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { ArrowLeft, Warehouse, Users, Building2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyDetail, CompanyRow } from '@/hooks/useAllCompanies';
import { DataTable, Column } from '@/components/ui/DataTable';
import { useToast } from '@/contexts/ToastContext';
import type { CompanyBranch, CompanyStaffMember } from '@/hooks/useAllCompanies';

const PLAN_LABELS: Record<CompanyRow['subscription_plan'], string> = {
  trial: 'Trial', basic: 'Basic', professional: 'Professional', enterprise: 'Enterprise',
};

export function CompanyDetailPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const { isPlatformAdmin, loading: authLoading } = useAuth();
  const { company, branches, staff, loading, changePlan } = useCompanyDetail(companyId ?? null);
  const { push } = useToast();
  const [changingPlan, setChangingPlan] = useState(false);

  if (!authLoading && !isPlatformAdmin) return <Navigate to="/platform-admin/login" replace />;

  const handlePlanChange = async (plan: CompanyRow['subscription_plan']) => {
    setChangingPlan(true);
    const { error } = await changePlan(plan);
    setChangingPlan(false);
    push(error ? 'error' : 'success', error ?? `Plan updated to ${PLAN_LABELS[plan]}.`);
  };

  const branchColumns: Column<CompanyBranch>[] = [
    { key: 'name', header: 'Branch', render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'code', header: 'Code' },
    { key: 'address', header: 'Address', render: (r) => r.address ?? '—' },
    { key: 'status', header: 'Status', render: (r) => <span className={r.is_active ? 'badge-green' : 'badge-slate'}>{r.is_active ? 'Active' : 'Inactive'}</span> },
  ];

  const staffColumns: Column<CompanyStaffMember>[] = [
    { key: 'full_name', header: 'Name', render: (r) => <span className="font-medium">{r.full_name}</span> },
    { key: 'email', header: 'Email' },
    { key: 'role', header: 'Role', render: (r) => r.role?.name ?? '—' },
    { key: 'status', header: 'Status', render: (r) => <span className={r.is_active ? 'badge-green' : 'badge-slate'}>{r.is_active ? 'Active' : 'Inactive'}</span> },
  ];

  if (loading || !company) {
    return <div className="mx-auto max-w-6xl p-6 text-center text-slate-400">Loading…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/platform-admin/companies" className="btn-ghost !px-2 !py-1"><ArrowLeft size={18} /></Link>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-700 text-white">
          <Building2 size={20} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">{company.name}</h1>
          <p className="text-sm text-slate-500">{company.slug}</p>
        </div>
        <span className={`ml-auto ${company.is_active ? 'badge-green' : 'badge-amber'}`}>
          {company.is_active ? 'Active' : 'Pending approval'}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card space-y-2 p-5 text-sm">
          <p className="mb-1 font-semibold text-slate-700 dark:text-slate-200">Company profile</p>
          <div className="flex justify-between"><span className="text-slate-500">Phone</span><span>{company.phone ?? '—'}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Currency</span><span>{company.currency}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Tax number</span><span>{company.tax_number ?? '—'}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Address</span><span className="text-right">{company.address ?? '—'}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Registered</span><span>{new Date(company.created_at).toLocaleDateString()}</span></div>
        </div>

        <div className="card space-y-3 p-5 text-sm">
          <p className="font-semibold text-slate-700 dark:text-slate-200">Subscription plan</p>
          <select
            className="input"
            value={company.subscription_plan}
            disabled={changingPlan}
            onChange={(e) => handlePlanChange(e.target.value as CompanyRow['subscription_plan'])}
          >
            {(Object.keys(PLAN_LABELS) as CompanyRow['subscription_plan'][]).map((p) => (
              <option key={p} value={p}>{PLAN_LABELS[p]}</option>
            ))}
          </select>
          <p className="text-xs text-slate-400">Changing this only affects what you display/bill for — it doesn't itself gate any feature yet.</p>
        </div>

        <div className="card space-y-2 p-5 text-sm">
          <p className="mb-1 font-semibold text-slate-700 dark:text-slate-200">Usage</p>
          <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-slate-500"><Warehouse size={14} /> Branches</span><span className="font-semibold">{branches.length}</span></div>
          <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-slate-500"><Users size={14} /> Staff</span><span className="font-semibold">{staff.length}</span></div>
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-lg font-semibold text-slate-800 dark:text-slate-100">Branches (Warehouses)</h2>
        <DataTable columns={branchColumns} rows={branches} rowKey={(r) => r.id} emptyMessage="No branches set up yet." />
      </div>

      <div>
        <h2 className="mb-2 text-lg font-semibold text-slate-800 dark:text-slate-100">Staff</h2>
        <DataTable columns={staffColumns} rows={staff} rowKey={(r) => r.id} emptyMessage="No staff added yet." />
      </div>
    </div>
  );
}
