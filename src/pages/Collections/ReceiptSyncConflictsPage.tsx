import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { PermissionGate } from '@/components/common/PermissionGate';

interface OpenReceiptConflict {
  id: string;
  receipt_id: string;
  conflict_type: string;
  conflict_details: Record<string, unknown>;
  detected_at: string;
  receipt?: { receipt_number: string; customer?: { business_name: string } | null } | null;
}

const RESOLUTION_OPTIONS = [
  { value: 'use_server_values', label: 'Use Server Values' },
  { value: 'keep_local_pending_approval', label: 'Keep Local (Pending Approval)' },
  { value: 'return_to_creator', label: 'Return to Creator' },
  { value: 'supervisor_decision', label: 'Supervisor Decision (manual)' },
  { value: 'reduce_allocation', label: 'Reduce Allocation' },
  { value: 'cancel_local_version', label: 'Cancel Local Version' },
];

function useOpenReceiptSyncConflicts() {
  const { company } = useAuth();
  const [conflicts, setConflicts] = useState<OpenReceiptConflict[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data } = await supabase
      .from('receipt_sync_conflicts')
      .select('*, receipt:receipt_vouchers(receipt_number, customer:customers(business_name))')
      .eq('company_id', company.id)
      .eq('status', 'open')
      .order('detected_at');
    setConflicts((data ?? []) as unknown as OpenReceiptConflict[]);
    setLoading(false);
  }, [company]);

  useEffect(() => { load(); }, [load]);

  const resolve = useCallback(async (conflictId: string, resolution: string, notes?: string) => {
    const { error } = await supabase.rpc('resolve_receipt_sync_conflict', { p_conflict_id: conflictId, p_resolution: resolution, p_notes: notes ?? null });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  return { conflicts, loading, resolve };
}

function formatDetails(details: Record<string, unknown>): string {
  return Object.entries(details).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(' · ');
}

export function ReceiptSyncConflictsPage() {
  const { conflicts, loading, resolve } = useOpenReceiptSyncConflicts();
  const { push } = useToast();
  const navigate = useNavigate();
  const [resolutionByConflict, setResolutionByConflict] = useState<Record<string, string>>({});

  const handleResolve = async (conflictId: string) => {
    const resolution = resolutionByConflict[conflictId];
    if (!resolution) { push('error', 'Pick a resolution first.'); return; }
    const notes = prompt('Notes (optional):') ?? undefined;
    const { error } = await resolve(conflictId, resolution, notes);
    if (error) { push('error', error); return; }
    push('success', 'Conflict resolved.');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-slate-100">
          <AlertTriangle size={20} /> Receipt Sync Conflicts
        </h1>
        <p className="text-sm text-slate-500">
          Offline receipts that came back online with data that no longer matches the server — customer status or
          an allocated invoice's outstanding balance changed since the receipt was created offline.
        </p>
      </div>

      <div className="space-y-3">
        {loading && <p className="text-center text-slate-400">Loading…</p>}
        {!loading && conflicts.length === 0 && <p className="text-center text-slate-400">No open sync conflicts.</p>}
        {conflicts.map((c) => (
          <div key={c.id} className="card p-4">
            <div className="flex items-start justify-between">
              <div>
                <button className="font-medium text-blue-600 hover:underline dark:text-blue-400" onClick={() => navigate(`/collections/receipts/${c.receipt_id}`)}>
                  {c.receipt?.receipt_number ?? c.receipt_id}
                </button>
                <p className="text-sm text-slate-500">{c.receipt?.customer?.business_name}</p>
                <p className="mt-1 text-sm font-medium capitalize text-amber-600">{c.conflict_type.replace(/_/g, ' ')}</p>
                <p className="mt-1 text-xs text-slate-500">{formatDetails(c.conflict_details)}</p>
                <p className="mt-1 text-xs text-slate-400">Detected {new Date(c.detected_at).toLocaleString()}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select
                className="input !w-auto"
                value={resolutionByConflict[c.id] ?? ''}
                onChange={(e) => setResolutionByConflict((prev) => ({ ...prev, [c.id]: e.target.value }))}
              >
                <option value="">Choose resolution…</option>
                {RESOLUTION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <PermissionGate permission="receipt_vouchers:resolve_sync_conflict">
                <button className="btn-primary !py-1.5 text-sm" onClick={() => handleResolve(c.id)}>
                  <Check size={14} /> Resolve
                </button>
              </PermissionGate>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
