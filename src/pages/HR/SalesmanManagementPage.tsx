import { useState } from 'react';
import { Users, Target, TrendingUp } from 'lucide-react';
import { useSalesmen, useSalesmanTargets } from '@/hooks/useSalesmanTargets';
import { useVans } from '@/hooks/useVans';
import { useRoutes } from '@/hooks/useRoutes';
import { useReports } from '@/hooks/useReports';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';

function monthStartIso() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function SalesmanManagementPage() {
  const { salesmen, loading } = useSalesmen();
  const { vans } = useVans();
  const { routes } = useRoutes();
  const month = monthStartIso();
  const { targets, setTarget } = useSalesmanTargets(month);
  const { salesmen: performance } = useReports(month, todayIso());
  const { push } = useToast();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [salesTarget, setSalesTarget] = useState(0);
  const [collectionTarget, setCollectionTarget] = useState(0);
  const [commissionRate, setCommissionRate] = useState(0);
  const [saving, setSaving] = useState(false);

  const selected = salesmen.find((s) => s.id === selectedId);
  const assignedVan = (userId: string) => vans.find((v) => v.salesman_id === userId);
  const assignedRoute = (userId: string) => routes.find((r) => r.salesman_id === userId);
  const targetFor = (userId: string) => targets.find((t) => t.user_id === userId);
  const perfFor = (userId: string) => performance.find((p) => p.salesman_id === userId);

  const selectDriver = (id: string) => {
    setSelectedId(id);
    const t = targetFor(id);
    setSalesTarget(t?.sales_target ?? 0);
    setCollectionTarget(t?.collection_target ?? 0);
    setCommissionRate(t?.commission_rate ?? 0);
  };

  const submit = async () => {
    if (!selectedId) return;
    setSaving(true);
    const { error } = await setTarget({ userId: selectedId, salesTarget, collectionTarget, commissionRate });
    setSaving(false);
    push(error ? 'error' : 'success', error ?? 'Targets saved.');
  };

  const selectedPerf = selected ? perfFor(selected.id) : undefined;
  const selectedTargetRow = selected ? targetFor(selected.id) : undefined;
  const salesPct = selectedTargetRow && selectedTargetRow.sales_target > 0 && selectedPerf
    ? Math.round((selectedPerf.revenue / selectedTargetRow.sales_target) * 100) : null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Salesman Management</h1>
        <p className="text-sm text-slate-500">Assigned van/route, monthly sales &amp; collection targets, commission, and performance.</p>
      </div>

      {loading ? (
        <p className="text-center text-slate-400">Loading…</p>
      ) : salesmen.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 p-10 text-center">
          <Users className="text-slate-300" size={36} />
          <p className="text-sm text-slate-500">No staff with the "salesman" role yet — create one under Staff Accounts.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="card divide-y divide-slate-100 dark:divide-slate-800 lg:col-span-1">
            {salesmen.map((s) => {
              const perf = perfFor(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => selectDriver(s.id)}
                  className={`flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800 ${selectedId === s.id ? 'bg-brand-50 dark:bg-brand-900/20' : ''}`}
                >
                  <div>
                    <p className="font-medium">{s.full_name}</p>
                    <p className="text-xs text-slate-500">
                      {assignedVan(s.id)?.name ?? 'No van'} · {assignedRoute(s.id)?.name ?? 'No route'}
                    </p>
                  </div>
                  {perf && <span className="text-xs font-medium text-slate-600">{perf.revenue.toFixed(0)}</span>}
                </button>
              );
            })}
          </div>

          <div className="lg:col-span-2 space-y-4">
            {!selected ? (
              <div className="card flex h-full items-center justify-center p-10 text-center text-sm text-slate-400">
                Select a salesman to view performance and set targets.
              </div>
            ) : (
              <>
                <div className="card p-4">
                  <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100">
                    <TrendingUp size={16} /> This month's performance
                  </h2>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div><p className="text-slate-500">Revenue</p><p className="text-lg font-bold">{(selectedPerf?.revenue ?? 0).toFixed(2)}</p></div>
                    <div><p className="text-slate-500">Orders</p><p className="text-lg font-bold">{selectedPerf?.orders ?? 0}</p></div>
                    <div><p className="text-slate-500">Target progress</p><p className="text-lg font-bold">{salesPct !== null ? `${salesPct}%` : '—'}</p></div>
                  </div>
                </div>

                <div className="card space-y-4 p-4">
                  <h2 className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100">
                    <Target size={16} /> Targets for {new Date(month).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                  </h2>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="label">Sales target</label>
                      <input type="number" min={0} step="0.01" className="input" value={salesTarget} onChange={(e) => setSalesTarget(Number(e.target.value))} />
                    </div>
                    <div>
                      <label className="label">Collection target</label>
                      <input type="number" min={0} step="0.01" className="input" value={collectionTarget} onChange={(e) => setCollectionTarget(Number(e.target.value))} />
                    </div>
                    <div>
                      <label className="label">Commission rate (%)</label>
                      <input type="number" min={0} step="0.01" className="input" value={commissionRate} onChange={(e) => setCommissionRate(Number(e.target.value))} />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <PermissionGate permission="hr:edit">
                      <button className="btn-primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save targets'}</button>
                    </PermissionGate>
                  </div>
                </div>

                <div className="card p-4 text-sm text-slate-500">
                  Full sales and collection history for {selected.full_name} is in Sales History and Collections — use
                  those pages' search to filter by name.
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
