import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Wallet, CreditCard, Ban, AlertTriangle, TrendingUp, Clock3, ShieldAlert } from 'lucide-react';
import { useCreditDashboard } from '@/hooks/useCreditDashboard';
import { useCreditApprovals } from '@/hooks/useCreditApprovals';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';

function StatCard({ icon: Icon, label, value, accent }: { icon: any; label: string; value: number; accent: string }) {
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

export function CreditDashboardPage() {
  const { stats, loading, refreshing, refreshAll } = useCreditDashboard();
  const { pending, decide } = useCreditApprovals();
  const { push } = useToast();
  const navigate = useNavigate();

  useEffect(() => { refreshAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDecide = async (id: string, approve: boolean) => {
    const { error } = await decide(id, approve);
    push(error ? 'error' : 'success', error ?? (approve ? 'Approved.' : 'Rejected.'));
  };

  if (loading || !stats) return <p className="text-center text-slate-400">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Customer Credit Dashboard</h1>
          <p className="text-sm text-slate-500">Live credit status across every customer, recomputed on load.</p>
        </div>
        <button className="btn-secondary" onClick={refreshAll} disabled={refreshing}>
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} /> {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard icon={Wallet} label="Cash customers" value={stats.cashCustomers} accent="bg-slate-100 text-slate-700 dark:bg-slate-800" />
        <StatCard icon={CreditCard} label="Credit customers" value={stats.creditCustomers} accent="bg-blue-100 text-blue-700 dark:bg-blue-900/30" />
        <StatCard icon={CreditCard} label="Hybrid customers" value={stats.hybridCustomers} accent="bg-purple-100 text-purple-700 dark:bg-purple-900/30" />
        <StatCard icon={Ban} label="Blocked customers" value={stats.blockedCustomers} accent="bg-red-100 text-red-700 dark:bg-red-900/30" />
        <StatCard icon={AlertTriangle} label="Near credit limit" value={stats.nearLimitCustomers} accent="bg-amber-100 text-amber-700 dark:bg-amber-900/30" />
        <StatCard icon={TrendingUp} label="Over credit limit" value={stats.overLimitCustomers} accent="bg-red-100 text-red-700 dark:bg-red-900/30" />
        <StatCard icon={Clock3} label="Temp. credit active" value={stats.temporaryCreditActive} accent="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30" />
        <StatCard icon={ShieldAlert} label="Approvals pending" value={stats.approvalsPending} accent="bg-amber-100 text-amber-700 dark:bg-amber-900/30" />
      </div>

      <div className="card p-4">
        <h2 className="mb-3 font-semibold text-slate-800 dark:text-slate-100">Risk distribution</h2>
        <div className="flex flex-wrap gap-3">
          {stats.riskDistribution.map((r) => (
            <div key={r.label} className="rounded-lg bg-slate-100 px-3 py-2 text-sm dark:bg-slate-800">
              <span className="font-medium">{r.label}</span>: {r.count}
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-lg font-semibold text-slate-800 dark:text-slate-100">Pending approvals</h2>
        {pending.length === 0 ? (
          <div className="card p-6 text-center text-sm text-slate-400">Nothing pending.</div>
        ) : (
          <div className="card overflow-hidden">
            <table className="table-base">
              <thead><tr><th>Customer</th><th>Type</th><th>Current</th><th>Requested</th><th>Reason</th><th></th></tr></thead>
              <tbody>
                {pending.map((a) => (
                  <tr key={a.id} className="cursor-pointer" onClick={() => navigate(`/customers/${a.customer_id}`)}>
                    <td className="font-medium">{a.customer?.business_name}</td>
                    <td className="capitalize">{a.request_type.replace('_', ' ')}</td>
                    <td>{a.old_value ?? '—'}</td>
                    <td>{a.new_value}</td>
                    <td>{a.reason ?? '—'}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <PermissionGate permission="customer_credit:approve">
                        <div className="flex gap-1">
                          <button className="btn-secondary !py-1" onClick={() => handleDecide(a.id, true)}>Approve</button>
                          <button className="btn-danger !py-1" onClick={() => handleDecide(a.id, false)}>Reject</button>
                        </div>
                      </PermissionGate>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
