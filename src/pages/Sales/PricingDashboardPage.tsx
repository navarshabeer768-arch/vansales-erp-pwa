import { useNavigate } from 'react-router-dom';
import { Tag, Users, DollarSign, Clock3, AlertTriangle, CalendarClock, Wallet } from 'lucide-react';
import { usePricingDashboard } from '@/hooks/useCustomerFinancials';

function StatCard({ icon: Icon, label, value, accent }: { icon: any; label: string; value: string | number; accent: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2">
        <div className={`rounded-lg p-2 ${accent}`}><Icon size={16} /></div>
        <p className="text-sm text-slate-500">{label}</p>
      </div>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

export function PricingDashboardPage() {
  const { stats, loading } = usePricingDashboard();
  const navigate = useNavigate();

  if (loading || !stats) return <p className="text-center text-slate-400">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Pricing Dashboard</h1>
          <p className="text-sm text-slate-500">Price lists, special prices, discounts, and opening balances at a glance.</p>
        </div>
        <button className="btn-secondary" onClick={() => navigate('/customers/price-lists')}><Tag size={16} /> Manage price lists</button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard icon={Tag} label="Total price lists" value={stats.totalPriceLists} accent="bg-blue-100 text-blue-700 dark:bg-blue-900/30" />
        <StatCard icon={DollarSign} label="Products w/ special prices" value={stats.productsWithSpecialPrices} accent="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30" />
        <StatCard icon={Clock3} label="Temporary discounts" value={stats.temporaryDiscounts} accent="bg-amber-100 text-amber-700 dark:bg-amber-900/30" />
        <StatCard icon={AlertTriangle} label="Expired price lists" value={stats.expiredPriceLists} accent="bg-red-100 text-red-700 dark:bg-red-900/30" />
        <StatCard icon={CalendarClock} label="Expiring within 30 days" value={stats.upcomingExpiry} accent="bg-amber-100 text-amber-700 dark:bg-amber-900/30" />
        <StatCard icon={Wallet} label="Net opening balance" value={stats.openingBalanceTotal.toFixed(2)} accent="bg-slate-100 text-slate-700 dark:bg-slate-800" />
      </div>

      <div className="card p-4">
        <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100"><Users size={16} /> Customers by price list</h2>
        {stats.customersByPriceList.length === 0 ? (
          <p className="text-sm text-slate-400">No customers have an assigned price list yet.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {stats.customersByPriceList.map((c) => (
              <div key={c.label} className="rounded-lg bg-slate-100 px-3 py-2 text-sm dark:bg-slate-800">
                <span className="font-medium">{c.label}</span>: {c.count}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
