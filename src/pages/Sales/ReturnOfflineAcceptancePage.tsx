import { useCallback, useEffect, useState } from 'react';
import { WifiOff, CheckCircle2, XCircle as XCircleIcon } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getDeviceId } from '@/lib/deviceId';
import { useAuth } from '@/contexts/AuthContext';

interface EligibilityResult { eligible: boolean; reason: string; van_id: string | null; employee_id: string | null }
interface AcceptanceLog {
  id: string;
  reconciliation_status: string;
  locally_accepted_at: string | null;
  synced_at: string | null;
  reconciliation_error: string | null;
  return?: { return_number: string } | null;
}

function useReturnOfflineAcceptanceStatus() {
  const { company } = useAuth();
  const [eligibility, setEligibility] = useState<EligibilityResult | null>(null);
  const [logs, setLogs] = useState<AcceptanceLog[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const deviceUid = getDeviceId();
    const [{ data: eligibilityData }, { data: logData }] = await Promise.all([
      supabase.rpc('check_return_offline_acceptance_eligibility', { p_device_uid: deviceUid }),
      supabase.from('sales_return_offline_acceptance_logs').select('*, return:sales_returns(return_number)').eq('company_id', company.id).order('locally_accepted_at', { ascending: false }).limit(20),
    ]);
    setEligibility((eligibilityData?.[0] as EligibilityResult) ?? null);
    setLogs((logData ?? []) as unknown as AcceptanceLog[]);
    setLoading(false);
  }, [company]);

  useEffect(() => { load(); }, [load]);

  return { eligibility, logs, loading, reload: load };
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30',
  reconciled: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30',
  reconciliation_failed: 'bg-red-100 text-red-700 dark:bg-red-900/30',
  conflict: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30',
};

export function ReturnOfflineAcceptancePage() {
  const { eligibility, logs, loading } = useReturnOfflineAcceptanceStatus();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-slate-100">
          <WifiOff size={20} /> Offline Return Acceptance
        </h1>
        <p className="text-sm text-slate-500">
          A quarantine receipt only — accepting a return offline never posts stock or credit locally. Everything is
          revalidated and posted once the device is back online.
        </p>
      </div>

      <div className="card p-4">
        <h3 className="mb-2 font-semibold">This Device</h3>
        {loading && <p className="text-sm text-slate-400">Checking eligibility…</p>}
        {!loading && eligibility && (
          <div className={`flex items-center gap-2 rounded-lg p-3 text-sm ${eligibility.eligible ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20' : 'bg-red-50 text-red-700 dark:bg-red-900/20'}`}>
            {eligibility.eligible ? <CheckCircle2 size={18} /> : <XCircleIcon size={18} />}
            <span>{eligibility.reason}</span>
          </div>
        )}
        {!loading && !eligibility && <p className="text-sm text-slate-500">No eligibility data available.</p>}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-700">
              <th className="p-3">Return</th><th className="p-3">Accepted Locally</th><th className="p-3">Synced</th>
              <th className="p-3">Status</th><th className="p-3">Error</th>
            </tr>
          </thead>
          <tbody>
            {!loading && logs.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-slate-400">No offline acceptance activity yet.</td></tr>}
            {logs.map((l) => (
              <tr key={l.id} className="border-b border-slate-100 dark:border-slate-800">
                <td className="p-3">{l.return?.return_number ?? '—'}</td>
                <td className="p-3">{l.locally_accepted_at ? new Date(l.locally_accepted_at).toLocaleString() : '—'}</td>
                <td className="p-3">{l.synced_at ? new Date(l.synced_at).toLocaleString() : '—'}</td>
                <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[l.reconciliation_status] ?? 'bg-slate-100 text-slate-600'}`}>{l.reconciliation_status.replace(/_/g, ' ')}</span></td>
                <td className="p-3 text-xs text-red-500">{l.reconciliation_error ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
