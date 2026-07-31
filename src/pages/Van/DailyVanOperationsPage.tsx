import { useState } from 'react';
import { Play, Pause, Square, Ban, ClipboardList, ScanLine, Printer } from 'lucide-react';
import { useVans } from '@/hooks/useVans';
import { useMyVanIds } from '@/hooks/useVanAssignments';
import { useRoutes } from '@/hooks/useRoutes';
import { useDailyVanOperations, DailyVanOperation, todayIso } from '@/hooks/useDailyVanOperations';
import { useVanStock } from '@/hooks/useVanUnloadings';
import { useStockReconciliation, ReconciliationItemDraft } from '@/hooks/useStockReconciliation';
import { useAuth } from '@/contexts/AuthContext';
import { usePrintSettings, logPrint } from '@/hooks/usePrintSettings';
import { printDocument } from '@/lib/documentPrint';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { SignaturePad } from '@/components/common/SignaturePad';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';

const STATUS_BADGE: Record<string, string> = {
  not_started: 'badge-slate', in_progress: 'badge-green', paused: 'badge-amber', ended: 'badge-slate', cancelled: 'badge-red',
};

function StartOperationModal({ open, onClose, vanId, onStarted }: { open: boolean; onClose: () => void; vanId: string; onStarted: () => void }) {
  const { routes } = useRoutes();
  const { startOperation } = useDailyVanOperations();
  const { push } = useToast();
  const [routeId, setRouteId] = useState('');
  const [odometer, setOdometer] = useState(0);
  const [cash, setCash] = useState(0);
  const [signature, setSignature] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    const { error } = await startOperation({
      vanId, routeId: routeId || undefined, openingOdometer: odometer, openingCash: cash,
      signatureData: signature ?? undefined, notes: notes || undefined,
    });
    setSubmitting(false);
    if (error) { push('error', error); return; }
    push('success', 'Operation started.');
    onStarted();
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Start today's operation" size="sm">
      <div className="space-y-4">
        <div>
          <label className="label">Route</label>
          <select className="input" value={routeId} onChange={(e) => setRouteId(e.target.value)}>
            <option value="">— None —</option>
            {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Opening odometer (km) *</label>
            <input type="number" min={0} step="0.1" className="input" value={odometer} onChange={(e) => setOdometer(Number(e.target.value))} />
          </div>
          <div>
            <label className="label">Opening cash *</label>
            <input type="number" min={0} step="0.01" className="input" value={cash} onChange={(e) => setCash(Number(e.target.value))} />
          </div>
        </div>
        <SignaturePad label="Driver/Salesman signature" onChange={setSignature} />
        <div>
          <label className="label">Notes</label>
          <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={onClose} disabled={submitting}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={submitting}>
            <Play size={16} /> {submitting ? 'Starting…' : 'Start operation'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function EndOperationModal({ operation, onClose, onEnded }: { operation: DailyVanOperation | null; onClose: () => void; onEnded: () => void }) {
  const { endOperation } = useDailyVanOperations();
  const { push } = useToast();
  const [odometer, setOdometer] = useState(0);
  const [cash, setCash] = useState(0);
  const [signature, setSignature] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!operation) return;
    setSubmitting(true);
    const { error } = await endOperation({
      id: operation.id, closingOdometer: odometer, closingCash: cash,
      signatureData: signature ?? undefined, notes: notes || undefined,
    });
    setSubmitting(false);
    if (error) { push('error', error); return; }
    push('success', 'Operation ended.');
    onEnded();
    onClose();
  };

  return (
    <Modal open={!!operation} onClose={onClose} title="End today's operation" size="sm">
      {operation && (
        <div className="space-y-4">
          <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800">
            Opened at {operation.opening_time ? new Date(operation.opening_time).toLocaleTimeString() : '—'} with odometer{' '}
            {operation.opening_odometer ?? '—'} km and cash {operation.opening_cash.toFixed(2)}.
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Closing odometer (km) *</label>
              <input type="number" min={0} step="0.1" className="input" value={odometer} onChange={(e) => setOdometer(Number(e.target.value))} />
            </div>
            <div>
              <label className="label">Closing cash *</label>
              <input type="number" min={0} step="0.01" className="input" value={cash} onChange={(e) => setCash(Number(e.target.value))} />
            </div>
          </div>
          <SignaturePad label="Driver/Salesman signature" onChange={setSignature} />
          <div>
            <label className="label">Notes</label>
            <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button className="btn-secondary" onClick={onClose} disabled={submitting}>Cancel</button>
            <button className="btn-primary" onClick={submit} disabled={submitting}>
              <Square size={16} /> {submitting ? 'Ending…' : 'End operation'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function ReconciliationSection({ operation }: { operation: DailyVanOperation }) {
  const { stock } = useVanStock(operation.van_id);
  const { rows, submit, approve } = useStockReconciliation(operation.id);
  const { push } = useToast();
  const { company, user } = useAuth();
  const { settings } = usePrintSettings();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const printStockCountReport = async () => {
    printDocument({
      title: 'Stock Count Report', subtitle: operation.van?.name ?? '',
      meta: [{ label: 'Date', value: operation.operation_date }, { label: 'Store', value: company?.name ?? '—' }],
      columns: [{ header: 'Product' }, { header: 'System Qty', align: 'right' }, { header: 'Physical Qty', align: 'right' }, { header: 'Difference', align: 'right' }, { header: 'Status' }],
      rows: rows.map((r) => [r.product?.name ?? '—', r.system_quantity, r.physical_quantity, r.difference_quantity, r.status]),
      settings: { ...settings, paper_size: 'a4' },
    });
    if (company) await logPrint(company.id, user?.id ?? null, 'stock_count_report', operation.id, 'browser_a4', settings.copies);
    push('success', 'Stock count report sent to print.');
  };

  const handleSubmit = async () => {
    const items: ReconciliationItemDraft[] = stock
      .filter((s) => counts[s.id] !== undefined)
      .map((s) => ({ product_id: s.product_id, batch_id: s.batch_id, physical_quantity: counts[s.id], reason: reasons[s.id] }));
    if (items.length === 0) { push('error', 'Enter a physical count for at least one product.'); return; }
    setSubmitting(true);
    const { error } = await submit(operation.id, items);
    setSubmitting(false);
    if (error) { push('error', error); return; }
    push('success', `Submitted ${items.length} count(s) for reconciliation.`);
    setCounts({});
    setReasons({});
  };

  const handleApprove = async (id: string) => {
    const { error } = await approve(id);
    push(error ? 'error' : 'success', error ?? 'Reconciliation approved and stock adjusted.');
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Physical count</h3>
        <div className="card overflow-hidden">
          <table className="table-base">
            <thead><tr><th>Product</th><th>Batch</th><th>System qty</th><th>Physical count</th><th>Difference</th><th>Reason</th></tr></thead>
            <tbody>
              {stock.map((s) => {
                const counted = counts[s.id];
                const diff = counted !== undefined ? counted - s.quantity : null;
                return (
                  <tr key={s.id}>
                    <td className="font-medium">{s.product?.name}</td>
                    <td>{s.batch?.batch_no ?? '—'}</td>
                    <td>{s.quantity}</td>
                    <td>
                      <input type="number" min={0} step="0.001" className="input !w-24 !py-1.5"
                        value={counted ?? ''} placeholder={String(s.quantity)}
                        onChange={(e) => setCounts((prev) => ({ ...prev, [s.id]: Number(e.target.value) }))} />
                    </td>
                    <td className={diff && diff !== 0 ? (diff > 0 ? 'text-emerald-600' : 'text-red-600') : ''}>
                      {diff !== null ? (diff > 0 ? `+${diff}` : diff) : '—'}
                    </td>
                    <td>
                      <input className="input !w-32 !py-1.5" placeholder="Optional"
                        value={reasons[s.id] ?? ''} onChange={(e) => setReasons((prev) => ({ ...prev, [s.id]: e.target.value }))} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex justify-end">
          <button className="btn-primary" onClick={handleSubmit} disabled={submitting}>
            <ScanLine size={16} /> {submitting ? 'Submitting…' : 'Submit for reconciliation'}
          </button>
        </div>
      </div>

      {rows.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Reconciliation records</h3>
            <button className="btn-secondary !py-1" onClick={printStockCountReport}><Printer size={14} /> Stock Count Report</button>
          </div>
          <div className="card overflow-hidden">
            <table className="table-base">
              <thead><tr><th>Product</th><th>System</th><th>Physical</th><th>Difference</th><th>Value</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.product?.name}</td>
                    <td>{r.system_quantity}</td>
                    <td>{r.physical_quantity}</td>
                    <td className={r.difference_quantity !== 0 ? (r.difference_quantity > 0 ? 'text-emerald-600' : 'text-red-600') : ''}>
                      {r.difference_quantity > 0 ? `+${r.difference_quantity}` : r.difference_quantity}
                    </td>
                    <td>{r.difference_value.toFixed(2)}</td>
                    <td><span className={r.status === 'approved' ? 'badge-green' : 'badge-amber'}>{r.status}</span></td>
                    <td>
                      {r.status === 'pending' && (
                        <PermissionGate permission="van_loading:approve">
                          <button className="btn-secondary !py-1" onClick={() => handleApprove(r.id)}>Approve</button>
                        </PermissionGate>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export function DailyVanOperationsPage() {
  const { vans } = useVans();
  const myVanIds = useMyVanIds();
  const accessibleVans = myVanIds === null ? vans : vans.filter((v) => myVanIds.has(v.id));
  const [vanId, setVanId] = useState('');
  const { operations, loading, reload, pauseOperation, resumeOperation, cancelOperation } = useDailyVanOperations();
  const { push } = useToast();
  const [startOpen, setStartOpen] = useState(false);
  const [endingOp, setEndingOp] = useState<DailyVanOperation | null>(null);
  const [cancellingOp, setCancellingOp] = useState<DailyVanOperation | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [busy, setBusy] = useState(false);
  const { company, user } = useAuth();
  const { settings } = usePrintSettings();

  const todaysOp = operations.find((o) => o.van_id === vanId && o.operation_date === todayIso());

  const printDailySummary = async () => {
    if (!todaysOp) return;
    printDocument({
      title: 'Daily Van Summary', subtitle: todaysOp.van?.name ?? '',
      meta: [
        { label: 'Date', value: todaysOp.operation_date }, { label: 'Status', value: todaysOp.status },
        { label: 'Route', value: todaysOp.route?.name ?? '—' }, { label: 'Store', value: company?.name ?? '—' },
      ],
      columns: [{ header: 'Metric' }, { header: 'Opening', align: 'right' }, { header: 'Closing', align: 'right' }],
      rows: [
        ['Time', todaysOp.opening_time ? new Date(todaysOp.opening_time).toLocaleTimeString() : '—', todaysOp.closing_time ? new Date(todaysOp.closing_time).toLocaleTimeString() : '—'],
        ['Odometer (km)', todaysOp.opening_odometer ?? '—', todaysOp.closing_odometer ?? '—'],
        ['Cash', todaysOp.opening_cash.toFixed(2), todaysOp.closing_cash?.toFixed(2) ?? '—'],
        ['Stock value', todaysOp.opening_stock_value?.toFixed(2) ?? '—', todaysOp.closing_stock_value?.toFixed(2) ?? '—'],
      ],
      settings: { ...settings, paper_size: 'a4' },
    });
    if (company) await logPrint(company.id, user?.id ?? null, 'daily_summary', todaysOp.id, 'browser_a4', settings.copies);
    push('success', 'Daily summary sent to print.');
  };

  const handlePause = async () => {
    if (!todaysOp) return;
    const { error } = await pauseOperation(todaysOp.id);
    push(error ? 'error' : 'success', error ?? 'Route paused.');
  };
  const handleResume = async () => {
    if (!todaysOp) return;
    const { error } = await resumeOperation(todaysOp.id);
    push(error ? 'error' : 'success', error ?? 'Route resumed.');
  };
  const handleCancel = async () => {
    if (!cancellingOp) return;
    setBusy(true);
    const { error } = await cancelOperation(cancellingOp.id, cancelReason);
    setBusy(false);
    setCancellingOp(null);
    setCancelReason('');
    push(error ? 'error' : 'success', error ?? 'Operation cancelled.');
  };

  const historyColumns: Column<DailyVanOperation>[] = [
    { key: 'date', header: 'Date', sortValue: (r) => r.operation_date, render: (r) => r.operation_date },
    { key: 'van', header: 'Van', render: (r) => r.van?.name ?? '—' },
    { key: 'route', header: 'Route', render: (r) => r.route?.name ?? '—' },
    { key: 'status', header: 'Status', render: (r) => <span className={STATUS_BADGE[r.status]}>{r.status.replace('_', ' ')}</span> },
    { key: 'opening', header: 'Opening (cash / odo / stock)', render: (r) => `${r.opening_cash.toFixed(2)} / ${r.opening_odometer ?? '—'} / ${r.opening_stock_value?.toFixed(2) ?? '—'}` },
    { key: 'closing', header: 'Closing (cash / odo / stock)', render: (r) => r.closing_time ? `${r.closing_cash?.toFixed(2)} / ${r.closing_odometer ?? '—'} / ${r.closing_stock_value?.toFixed(2) ?? '—'}` : '—' },
    { key: 'duration', header: 'Duration', render: (r) => {
      if (!r.opening_time) return '—';
      const end = r.closing_time ? new Date(r.closing_time) : new Date();
      const mins = Math.round((end.getTime() - new Date(r.opening_time).getTime()) / 60000);
      return `${Math.floor(mins / 60)}h ${mins % 60}m`;
    } },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Daily Van Operations</h1>
        <p className="text-sm text-slate-500">Start/pause/resume/end each van's daily shift, with opening/closing cash, odometer, stock value, and signature.</p>
      </div>

      <div className="card p-4">
        <label className="label">Van</label>
        <select className="input max-w-xs" value={vanId} onChange={(e) => setVanId(e.target.value)}>
          <option value="">Select a van…</option>
          {accessibleVans.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      </div>

      {vanId && (
        <div className="card space-y-4 p-4">
          {!todaysOp || todaysOp.status === 'not_started' ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <ClipboardList className="text-slate-300" size={36} />
              <p className="text-sm text-slate-500">No operation started for this van today.</p>
              <PermissionGate permission="van_loading:create">
                <button className="btn-primary" onClick={() => setStartOpen(true)}><Play size={16} /> Start today's operation</button>
              </PermissionGate>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <span className={STATUS_BADGE[todaysOp.status]}>{todaysOp.status.replace('_', ' ')}</span>
                  <p className="mt-1 text-sm text-slate-500">
                    Opened {todaysOp.opening_time ? new Date(todaysOp.opening_time).toLocaleTimeString() : '—'} ·
                    Odometer {todaysOp.opening_odometer ?? '—'} km · Cash {todaysOp.opening_cash.toFixed(2)} ·
                    Stock value {todaysOp.opening_stock_value?.toFixed(2) ?? '—'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button className="btn-secondary" onClick={printDailySummary}><Printer size={16} /> Daily Summary</button>
                  <PermissionGate permission="van_loading:edit">
                    {todaysOp.status === 'in_progress' && (
                      <button className="btn-secondary" onClick={handlePause}><Pause size={16} /> Pause</button>
                    )}
                    {todaysOp.status === 'paused' && (
                      <button className="btn-secondary" onClick={handleResume}><Play size={16} /> Resume</button>
                    )}
                    {(todaysOp.status === 'in_progress' || todaysOp.status === 'paused') && (
                      <>
                        <button className="btn-primary" onClick={() => setEndingOp(todaysOp)}><Square size={16} /> End route</button>
                        <button className="btn-danger" onClick={() => setCancellingOp(todaysOp)}><Ban size={16} /> Cancel</button>
                      </>
                    )}
                  </PermissionGate>
                </div>
              </div>

              {(todaysOp.status === 'in_progress' || todaysOp.status === 'paused') && (
                <ReconciliationSection operation={todaysOp} />
              )}
            </>
          )}
        </div>
      )}

      <div>
        <h2 className="mb-2 text-lg font-semibold text-slate-800 dark:text-slate-100">Daily Van Summary</h2>
        <DataTable columns={historyColumns} rows={operations} rowKey={(r) => r.id} loading={loading} exportFilename="daily-van-summary"
          searchPlaceholder="Search van or route…" searchFn={(r, q) => (r.van?.name ?? '').toLowerCase().includes(q) || (r.route?.name ?? '').toLowerCase().includes(q)} />
      </div>

      {vanId && <StartOperationModal open={startOpen} onClose={() => setStartOpen(false)} vanId={vanId} onStarted={reload} />}
      <EndOperationModal operation={endingOp} onClose={() => setEndingOp(null)} onEnded={reload} />

      <Modal open={!!cancellingOp} onClose={() => { setCancellingOp(null); setCancelReason(''); }} title="Cancel operation" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">This marks today's operation as cancelled. This cannot be undone.</p>
          <div>
            <label className="label">Reason *</label>
            <textarea className="input" rows={2} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button className="btn-secondary" onClick={() => { setCancellingOp(null); setCancelReason(''); }} disabled={busy}>Back</button>
            <button className="btn-danger" onClick={handleCancel} disabled={busy || !cancelReason.trim()}>
              {busy ? 'Cancelling…' : 'Cancel operation'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
