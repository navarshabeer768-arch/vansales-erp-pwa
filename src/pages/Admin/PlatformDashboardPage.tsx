import { Building2, CheckCircle2, Clock, Warehouse, Users, Package } from 'lucide-react';
import { usePlatformStats } from '@/hooks/usePlatformOverview';

function KpiCard({ icon: Icon, label, value, accent }: { icon: React.ElementType; label: string; value: number | string; accent: string }) {
  return (
    <div className="flex items-center gap-4 rounded-xl bg-white p-5 shadow-sm">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${accent}`}>
        <Icon size={20} />
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-800">{value}</p>
        <p className="text-sm text-slate-500">{label}</p>
      </div>
    </div>
  );
}

export function PlatformDashboardPage() {
  const { stats, loading } = usePlatformStats();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Platform Dashboard</h1>
        <p className="text-sm text-slate-500">Cross-tenant overview — every company, branch, and staff account on this platform.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard icon={Building2} label="Total companies" value={loading ? '—' : stats?.total_companies ?? 0} accent="bg-brand-100 text-brand-700" />
        <KpiCard icon={CheckCircle2} label="Active companies" value={loading ? '—' : stats?.active_companies ?? 0} accent="bg-emerald-100 text-emerald-700" />
        <KpiCard icon={Clock} label="Pending approval" value={loading ? '—' : stats?.pending_companies ?? 0} accent="bg-amber-100 text-amber-700" />
        <KpiCard icon={Warehouse} label="Total branches" value={loading ? '—' : stats?.total_branches ?? 0} accent="bg-violet-100 text-violet-700" />
        <KpiCard icon={Users} label="Total staff" value={loading ? '—' : stats?.total_staff ?? 0} accent="bg-sky-100 text-sky-700" />
        <KpiCard icon={Package} label="Total products" value={loading ? '—' : stats?.total_products ?? 0} accent="bg-rose-100 text-rose-700" />
      </div>
    </div>
  );
}
