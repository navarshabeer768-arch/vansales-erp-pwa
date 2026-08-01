import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  DollarSign, Calendar, CalendarRange, Wallet, HandCoins, AlertTriangle,
  Warehouse, Truck, PackageX, Clock, Undo2, ClipboardCheck, Radar,
  MapPin, TrendingUp, TrendingDown,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { useReports } from '@/hooks/useReports';
import { useVehicleAlerts } from '@/hooks/useVehicleAlerts';

function monthStartIso() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}
function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function KpiCard({ icon: Icon, label, value, accent, href }: {
  icon: React.ElementType; label: string; value: string | number; accent: string; href?: string;
}) {
  const content = (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:bg-slate-900 dark:border-slate-800">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${accent}`}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-lg font-bold text-slate-800 dark:text-slate-100">{value}</p>
        <p className="truncate text-xs text-slate-500">{label}</p>
      </div>
    </div>
  );
  return href ? <Link to={href}>{content}</Link> : content;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{children}</h2>;
}

export function DashboardPage() {
  const { company, user } = useAuth();
  const { stats, loading } = useDashboardStats();
  const { unacknowledgedCount: alertCount, refresh: refreshAlerts } = useVehicleAlerts();

  // Recompute vehicle alerts (maintenance due, expiry, offline vans) whenever
  // the Dashboard loads — there's no background server here to run a cron.
  useEffect(() => { refreshAlerts(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const { topProducts, topCustomers, salesmen, vans } = useReports(monthStartIso(), todayIso());

  const currency = company?.currency ?? '';
  const money = (n: number) => `${n.toFixed(2)} ${currency}`;
  const s = stats;

  const totalPending = (s?.pending_van_loadings ?? 0) + (s?.pending_van_unloadings ?? 0)
    + (s?.pending_stock_adjustments ?? 0) + (s?.pending_returns ?? 0);

  const routeCompletionPct = s && s.visits_today_planned > 0
    ? Math.round((s.visits_today_completed / s.visits_today_planned) * 100)
    : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">
          Welcome back{user?.full_name ? `, ${user.full_name.split(' ')[0]}` : ''}
        </h1>
        <p className="text-sm text-slate-500">{company?.name} — here's what's happening today.</p>
      </div>

      <div>
        <SectionTitle>Sales</SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KpiCard icon={DollarSign} label="Today's sales" value={loading ? '—' : money(s?.today_sales ?? 0)} accent="bg-brand-100 text-brand-700" href="/reports" />
          <KpiCard icon={Calendar} label="Monthly sales" value={loading ? '—' : money(s?.month_sales ?? 0)} accent="bg-emerald-100 text-emerald-700" href="/reports" />
          <KpiCard icon={CalendarRange} label="Yearly sales" value={loading ? '—' : money(s?.year_sales ?? 0)} accent="bg-violet-100 text-violet-700" href="/reports" />
        </div>
      </div>

      <div>
        <SectionTitle>Collections &amp; Balances</SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard icon={Wallet} label="Cash collected today" value={loading ? '—' : money(s?.today_cash_collected ?? 0)} accent="bg-emerald-100 text-emerald-700" />
          <KpiCard icon={HandCoins} label="Credit collected today" value={loading ? '—' : money(s?.today_credit_collected ?? 0)} accent="bg-sky-100 text-sky-700" href="/collections" />
          <KpiCard icon={TrendingUp} label="Outstanding receivables" value={loading ? '—' : money(s?.outstanding_receivables ?? 0)} accent="bg-amber-100 text-amber-700" href="/collections" />
          <KpiCard icon={TrendingDown} label="Outstanding payables" value={loading ? '—' : money(s?.outstanding_payables ?? 0)} accent="bg-rose-100 text-rose-700" href="/payments" />
        </div>
      </div>

      <div>
        <SectionTitle>Stock Health</SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard icon={Warehouse} label="Warehouse stock value" value={loading ? '—' : money(s?.warehouse_stock_value ?? 0)} accent="bg-brand-100 text-brand-700" href="/warehouse" />
          <KpiCard icon={Truck} label="Van stock value" value={loading ? '—' : money(s?.van_stock_value ?? 0)} accent="bg-violet-100 text-violet-700" />
          <KpiCard icon={PackageX} label="Low stock items" value={loading ? '—' : s?.low_stock_count ?? 0} accent="bg-red-100 text-red-700" href="/reports" />
          <KpiCard icon={Clock} label="Expiring within 30 days" value={loading ? '—' : s?.expiring_soon_count ?? 0} accent="bg-amber-100 text-amber-700" href="/reports" />
        </div>
      </div>

      <div>
        <SectionTitle>Pending Approvals {totalPending > 0 && <span className="ml-1 text-red-600">({totalPending})</span>}</SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard icon={AlertTriangle} label="Vehicle alerts" value={alertCount} accent={alertCount > 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'} href="/gps/alerts" />
          <KpiCard icon={ClipboardCheck} label="Van loadings" value={loading ? '—' : s?.pending_van_loadings ?? 0} accent="bg-amber-100 text-amber-700" href="/van-loading" />
          <KpiCard icon={ClipboardCheck} label="Van unloadings" value={loading ? '—' : s?.pending_van_unloadings ?? 0} accent="bg-amber-100 text-amber-700" href="/van-unloading" />
          <KpiCard icon={ClipboardCheck} label="Stock adjustments" value={loading ? '—' : s?.pending_stock_adjustments ?? 0} accent="bg-amber-100 text-amber-700" href="/warehouse" />
          <KpiCard icon={Undo2} label="Returns" value={loading ? '—' : s?.pending_returns ?? 0} accent="bg-amber-100 text-amber-700" href="/returns" />
        </div>
      </div>

      <div>
        <SectionTitle>Today's Operations</SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard icon={ClipboardCheck} label="Loadings approved / pending" value={loading ? '—' : `${s?.today_loadings_approved ?? 0} / ${s?.today_loadings_pending ?? 0}`} accent="bg-brand-100 text-brand-700" href="/van-loading" />
          <KpiCard icon={ClipboardCheck} label="Unloadings approved / pending" value={loading ? '—' : `${s?.today_unloadings_approved ?? 0} / ${s?.today_unloadings_pending ?? 0}`} accent="bg-brand-100 text-brand-700" href="/van-unloading" />
          <KpiCard icon={MapPin} label="Route completion" value={loading ? '—' : routeCompletionPct !== null ? `${routeCompletionPct}%` : 'No visits today'} accent="bg-emerald-100 text-emerald-700" href="/visits" />
          <KpiCard icon={Radar} label="Vans live now" value={loading ? '—' : `${s?.vans_live_now ?? 0} / ${s?.total_vans ?? 0}`} accent="bg-sky-100 text-sky-700" href="/gps" />
        </div>
        {s && s.visits_today_planned > 0 && (
          <p className="mt-2 text-xs text-slate-500">
            {s.visits_today_completed} completed, {s.visits_today_missed} missed, of {s.visits_today_planned} planned visits today.
          </p>
        )}
      </div>

      <div>
        <SectionTitle>Beat Plans &amp; Route Execution</SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard icon={MapPin} label="Beat plans active / inactive" value={loading ? '—' : `${s?.beat_plans_active ?? 0} / ${s?.beat_plans_inactive ?? 0}`} accent="bg-brand-100 text-brand-700" href="/routes/beat-plans" />
          <KpiCard icon={CalendarRange} label="Daily plans generated today" value={loading ? '—' : s?.daily_plans_generated_today ?? 0} accent="bg-sky-100 text-sky-700" href="/routes/daily-plans" />
          <KpiCard icon={ClipboardCheck} label="Plans pending approval" value={loading ? '—' : s?.plans_pending_approval ?? 0} accent="bg-amber-100 text-amber-700" href="/routes/daily-plans" />
          <KpiCard icon={Radar} label="Routes ready / not started" value={loading ? '—' : `${s?.routes_ready ?? 0} / ${s?.routes_not_started ?? 0}`} accent="bg-slate-100 text-slate-700" href="/routes/monitoring" />
          <KpiCard icon={TrendingUp} label="Routes in progress / paused" value={loading ? '—' : `${s?.routes_in_progress ?? 0} / ${s?.routes_paused ?? 0}`} accent="bg-emerald-100 text-emerald-700" href="/routes/monitoring" />
          <KpiCard icon={ClipboardCheck} label="Routes completed / partial" value={loading ? '—' : `${s?.routes_completed ?? 0} / ${s?.routes_partially_completed ?? 0}`} accent="bg-emerald-100 text-emerald-700" href="/routes/monitoring" />
          <KpiCard icon={TrendingUp} label="Average route completion" value={loading ? '—' : `${s?.average_route_completion_today ?? 0}%`} accent="bg-emerald-100 text-emerald-700" href="/routes/monitoring" />
          <KpiCard icon={TrendingDown} label="Late starts / early closures" value={loading ? '—' : `${s?.late_route_starts_today ?? 0} / ${s?.early_route_closures_today ?? 0}`} accent="bg-rose-100 text-rose-700" href="/routes/monitoring" />
        </div>
        {s && s.planned_customers_today > 0 && (
          <p className="mt-2 text-xs text-slate-500">
            {s.pending_customers_today} pending, {s.missed_customers_today} missed, {s.skipped_customers_today} skipped, {s.unplanned_customers_added_today} unplanned added — of {s.planned_customers_today} planned customer visits today across all beat plans.
          </p>
        )}
      </div>

      <div>
        <SectionTitle>Returns &amp; Damages (this month)</SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <KpiCard icon={Undo2} label="Returns this month" value={loading ? '—' : s?.returns_this_month ?? 0} accent="bg-rose-100 text-rose-700" href="/returns" />
          <KpiCard icon={AlertTriangle} label="Damaged items this month" value={loading ? '—' : s?.damages_this_month ?? 0} accent="bg-rose-100 text-rose-700" href="/van-unloading" />
        </div>
      </div>

      <div>
        <SectionTitle>This Month's Leaders</SectionTitle>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
          <div className="card p-4">
            <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Top products</p>
            {topProducts.length === 0 ? <p className="text-sm text-slate-400">No sales yet.</p> : (
              <ul className="space-y-1.5 text-sm">
                {topProducts.slice(0, 5).map((p) => (
                  <li key={p.product_id} className="flex justify-between"><span className="truncate">{p.name}</span><span className="font-medium">{p.revenue.toFixed(0)}</span></li>
                ))}
              </ul>
            )}
          </div>
          <div className="card p-4">
            <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Top customers</p>
            {topCustomers.length === 0 ? <p className="text-sm text-slate-400">No sales yet.</p> : (
              <ul className="space-y-1.5 text-sm">
                {topCustomers.slice(0, 5).map((c) => (
                  <li key={c.customer_id} className="flex justify-between"><span className="truncate">{c.name}</span><span className="font-medium">{c.revenue.toFixed(0)}</span></li>
                ))}
              </ul>
            )}
          </div>
          <div className="card p-4">
            <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Sales by salesman</p>
            {salesmen.length === 0 ? <p className="text-sm text-slate-400">No sales yet.</p> : (
              <ul className="space-y-1.5 text-sm">
                {salesmen.slice(0, 5).map((m) => (
                  <li key={m.salesman_id} className="flex justify-between"><span className="truncate">{m.name}</span><span className="font-medium">{m.revenue.toFixed(0)}</span></li>
                ))}
              </ul>
            )}
          </div>
          <div className="card p-4">
            <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Sales by van</p>
            {vans.length === 0 ? <p className="text-sm text-slate-400">No sales yet.</p> : (
              <ul className="space-y-1.5 text-sm">
                {vans.slice(0, 5).map((v) => (
                  <li key={v.van_id} className="flex justify-between"><span className="truncate">{v.name}</span><span className="font-medium">{v.revenue.toFixed(0)}</span></li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
