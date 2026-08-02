import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { PermissionGate } from '@/components/common/PermissionGate';

interface OpenInvoiceConflict {
  id: string;
  invoice_id: string;
  conflict_type: string;
  conflict_details: Record<string, unknown>;
  detected_at: string;
  invoice?: { invoice_number: string; customer?: { business_name: string } | null } | null;
}

const RESOLUTION_OPTIONS = [
  { value: 'use_server_values', label: 'Use Server Values' },
  { value: 'keep_local_pending_approval', label: 'Keep Local (Pending Approval)' },
  { value: 'return_to_creator', label: 'Return to Creator' },
  { value: 'supervisor_decision', label: 'Supervisor Decision (manual)' },
  { value: 'replace_batch', label: 'Replace Batch' },
  { value: 'replace_serial', label: 'Replace Serial' },
  { value: 'reduce_quantity_with_approval', label: 'Reduce Quantity (with approval)' },
  { value: 'convert_credit_to_cash_with_approval', label: 'Convert Credit to Cash (with approval)' },
  { value: 'cancel_local_version', label: 'Cancel Local Version' },
];

function useOpenInvoiceSyncConflicts() {
  const { company } = useAuth();
  const [conflicts, setConflicts] = useState<OpenInvoiceConflict[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data } = await supabase
      .from('sales_invoice_sync_conflicts')
      .select('*, invoice:sales_invoices(invoice_number, customer:customers(business_name))')
      .eq('company_id', company.id)
      .eq('status', 'open')
      .order('detected_at');
    setConflicts((data ?? []) as unknown as OpenInvoiceConflict[]);
    setLoading(false);
  }, [company]);

  useEffect(() => { load(); }, [load]);

  const resolve = useCallback(async (conflictId: string, resolution: string, notes?: string) => {
    const { error } = await supabase.rpc('resolve_invoice_sync_conflict', { p_conflict_id: conflictId, p_resolution: resolution, p_notes: notes ?? null });
    if (error) return { error: error.message };
    await load();
    return { data: true };
  }, [load]);

  return { conflicts, loading, resolve };
}

function formatDetails(details: Record<string, unknown>): string {
  return Object.entries(details).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(' · ');
}

export function InvoiceSyncConflictsPage() {
  const { conflicts, loading, resolve } = useOpenInvoiceSyncConflicts();
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
          <AlertTriangle size={20} /> Invoice Sync Conflicts
        </h1>
        <p className="text-sm text-slate-500">
          Offline invoices that came back online with data that no longer matches the server — customer/product
          status, pricing, stock, batch/serial availability, or credit changed since the invoice was created offline.
        </p>
      </div>

      <div className="space-y-3">
        {loading && <p className="text-center text-slate-400">Loading…</p>}
        {!loading && conflicts.length === 0 && <p className="text-center text-slate-400">No open sync conflicts.</p>}
        {conflicts.map((c) => (
          <div key={c.id} className="card p-4">
            <div className="flex items-start justify-between">
              <div>
                <button className="font-medium text-blue-600 hover:underline dark:text-blue-400" onClick={() => navigate(`/sales/invoices/${c.invoice_id}`)}>
                  {c.invoice?.invoice_number ?? c.invoice_id}
                </button>
                <p className="text-sm text-slate-500">{c.invoice?.customer?.business_name}</p>
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
              <PermissionGate permission="sales_invoices:resolve_offline_conflict">
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
