import { useState, useEffect } from 'react';
import { Plus, Check, Trash2, X, RotateCcw, Ban, Printer } from 'lucide-react';
import { useVans } from '@/hooks/useVans';
import { useWarehouses } from '@/hooks/useWarehouses';
import {
  useVanUnloadings, useVanStock, VanUnloadingItemDraft, UnloadingItemType, VanUnloading,
  VanUnloadingItemRow, fetchUnloadingItems,
} from '@/hooks/useVanUnloadings';
import { useAuth } from '@/contexts/AuthContext';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { SignaturePad } from '@/components/common/SignaturePad';
import { ApprovalHistoryList } from '@/components/common/ApprovalHistoryList';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';
import { printDocument } from '@/lib/documentPrint';

const TYPE_LABELS: Record<UnloadingItemType, string> = {
  remaining: 'Remaining (back to warehouse)',
  customer_return: 'Customer return (back to warehouse)',
  damaged: 'Damaged (written off)',
  expired: 'Expired (written off)',
};

const STATUS_BADGE: Record<string, string> = {
  draft: 'badge-slate', pending_approval: 'badge-amber', approved: 'badge-green',
  rejected: 'badge-red', reopened: 'badge-amber', cancelled: 'badge-red',
};

function NewUnloadingModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { vans } = useVans();
  const { warehouses } = useWarehouses();
  const { createUnloading } = useVanUnloadings();
  const { push } = useToast();

  const [vanId, setVanId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [rows, setRows] = useState<VanUnloadingItemDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const { stock } = useVanStock(vanId || null);

  const addRow = (stockId: string) => {
    const s = stock.find((x) => x.id === stockId);
    if (!s) return;
    setRows((prev) => [...prev, {
      product_id: s.product_id, batch_id: s.batch_id, item_type: 'remaining', quantity: s.quantity, system_quantity: s.quantity,
    }]);
  };

  const updateRow = (idx: number, patch: Partial<VanUnloadingItemDraft>) =>
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const removeRow = (idx: number) => setRows((prev) => prev.filter((_, i) => i !== idx));

  const reset = () => { setVanId(''); setWarehouseId(''); setRows([]); };

  const totalForProduct = (productId: string, batchId: string | null, excludeIdx: number) =>
    rows.reduce((sum, r, i) => (i !== excludeIdx && r.product_id === productId && r.batch_id === batchId ? sum + r.quantity : sum), 0);

  const submit = async () => {
    if (!vanId || !warehouseId) { push('error', 'Select a van and a destination warehouse.'); return; }
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const totalUsed = totalForProduct(r.product_id, r.batch_id, -1);
      if (totalUsed > r.system_quantity) {
        push('error', 'One or more products have entries totaling more than the van\'s current stock.');
        return;
      }
      if (r.quantity !== r.system_quantity && !r.variance_reason) {
        push('error', `Enter a variance reason for ${stock.find((x) => x.product_id === r.product_id)?.product?.name ?? 'a product'} — the physical quantity differs from system stock.`);
        return;
      }
    }
    setSubmitting(true);
    const { error } = await createUnloading(vanId, warehouseId, rows);
    setSubmitting(false);
    if (error) { push('error', error); return; }
    push('success', 'Unloading sheet created — pending approval.');
    reset();
    onCreated();
    onClose();
  };

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title="New van unloading sheet" size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Van</label>
            <select className="input" value={vanId} onChange={(e) => { setVanId(e.target.value); setRows([]); }}>
              <option value="">Select a van…</option>
              {vans.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.code})</option>)}
            </select>
          </div>
          <div>
            <label className="label">Return-to warehouse</label>
            <select className="input" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              <option value="">Select a warehouse…</option>
              {warehouses.filter((w) => w.is_active).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
        </div>

        {vanId && (
          <div>
            <label className="label">Add product from van stock</label>
            <select className="input" value="" onChange={(e) => e.target.value && addRow(e.target.value)}>
              <option value="">Select a product…</option>
              {stock.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.product?.name} {s.batch?.batch_no ? `(Batch ${s.batch.batch_no})` : ''} — on van {s.quantity}
                </option>
              ))}
            </select>
          </div>
        )}

        {rows.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="table-base">
              <thead><tr><th>Product</th><th>System qty</th><th>Type</th><th>Physical qty</th><th>Variance reason</th><th></th></tr></thead>
              <tbody>
                {rows.map((r, idx) => {
                  const s = stock.find((x) => x.product_id === r.product_id && x.batch_id === r.batch_id);
                  const hasVariance = r.quantity !== r.system_quantity;
                  return (
                    <tr key={idx}>
                      <td>{s?.product?.name}</td>
                      <td>{r.system_quantity}</td>
                      <td>
                        <select className="input !py-1.5" value={r.item_type}
                          onChange={(e) => updateRow(idx, { item_type: e.target.value as UnloadingItemType })}>
                          {Object.entries(TYPE_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                        </select>
                      </td>
                      <td>
                        <input type="number" min={0} step="0.001" className="input !py-1.5"
                          value={r.quantity} onChange={(e) => updateRow(idx, { quantity: Number(e.target.value) })} />
                      </td>
                      <td>
                        <input className="input !py-1.5 !w-36" placeholder={hasVariance ? 'Required' : 'N/A'}
                          disabled={!hasVariance} value={r.variance_reason ?? ''}
                          onChange={(e) => updateRow(idx, { variance_reason: e.target.value })} />
                      </td>
                      <td><button onClick={() => removeRow(idx)} className="text-slate-400 hover:text-red-600"><Trash2 size={16} /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={() => { reset(); onClose(); }} disabled={submitting}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={submitting || rows.length === 0}>
            {submitting ? 'Submitting…' : 'Submit for approval'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function UnloadingDetailModal({ unloading: sheet, onClose, onChanged }: { unloading: VanUnloading | null; onClose: () => void; onChanged: () => void }) {
  const { company } = useAuth();
  const { rejectUnloading, reopenUnloading, cancelUnloading, approveUnloading } = useVanUnloadings();
  const { push } = useToast();
  const [items, setItems] = useState<VanUnloadingItemRow[]>([]);
  const [reasonModal, setReasonModal] = useState<'reject' | 'cancel' | null>(null);
  const [reason, setReason] = useState('');
  const [approving, setApproving] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (sheet) fetchUnloadingItems(sheet.id).then(setItems); }, [sheet]);

  if (!sheet) return null;

  const handleApprove = async () => {
    setApproving(true);
    const { error } = await approveUnloading(sheet.id, approvalNotes || undefined, signature ?? undefined);
    setApproving(false);
    push(error ? 'error' : 'success', error ?? 'Approved — stock updated.');
    if (!error) onChanged();
  };

  const handleReasonSubmit = async () => {
    if (!reason.trim()) { push('error', 'A reason is required.'); return; }
    setBusy(true);
    const { error } = reasonModal === 'reject' ? await rejectUnloading(sheet.id, reason) : await cancelUnloading(sheet.id, reason);
    setBusy(false);
    setReasonModal(null);
    setReason('');
    push(error ? 'error' : 'success', error ?? (reasonModal === 'reject' ? 'Unloading rejected.' : 'Unloading cancelled.'));
    onChanged();
  };

  const handleReopen = async () => {
    setBusy(true);
    const { error } = await reopenUnloading(sheet.id);
    setBusy(false);
    push(error ? 'error' : 'success', error ?? 'Reopened as draft.');
    onChanged();
  };

  const printVerification = () => {
    printDocument({
      title: 'Unload Verification', subtitle: sheet.unloading_no,
      meta: [
        { label: 'Van', value: sheet.van?.name ?? '—' }, { label: 'Warehouse', value: sheet.warehouse?.name ?? '—' },
        { label: 'Date', value: new Date(sheet.created_at).toLocaleDateString() }, { label: 'Store', value: company?.name ?? '—' },
      ],
      columns: [{ header: 'Product' }, { header: 'Type' }, { header: 'Expected', align: 'right' }, { header: 'Actual', align: 'right' }, { header: 'Difference', align: 'right' }, { header: 'Reason' }],
      rows: items.map((i) => [
        i.product?.name ?? '—', TYPE_LABELS[i.item_type], i.system_quantity ?? '—', i.quantity,
        i.difference ?? 0, i.variance_reason ?? '—',
      ]),
      signatureLabel: 'Unloaded By',
    });
  };

  const canApprove = sheet.status === 'pending_approval';

  return (
    <Modal open={!!sheet} onClose={onClose} title={`Unloading ${sheet.unloading_no}`} size="lg">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className={STATUS_BADGE[sheet.status]}>{sheet.status.replace('_', ' ')}</span>
          <button className="btn-secondary !py-1" onClick={printVerification}><Printer size={14} /> Verification Sheet</button>
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="table-base">
            <thead><tr><th>Product</th><th>Type</th><th>Expected</th><th>Actual</th><th>Difference</th><th>Reason</th></tr></thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <td>{i.product?.name}</td>
                  <td>{TYPE_LABELS[i.item_type]}</td>
                  <td>{i.system_quantity ?? '—'}</td>
                  <td>{i.quantity}</td>
                  <td className={i.difference && i.difference !== 0 ? (i.difference > 0 ? 'text-emerald-600' : 'text-red-600') : ''}>
                    {i.difference ?? 0}
                  </td>
                  <td>{i.variance_reason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <PermissionGate permission="van_unloading:approve">
            {(sheet.status === 'rejected' || sheet.status === 'pending_approval') && (
              <button className="btn-secondary" onClick={handleReopen} disabled={busy}><RotateCcw size={14} /> Reopen</button>
            )}
            {canApprove && <button className="btn-danger" onClick={() => setReasonModal('reject')} disabled={busy}><X size={14} /> Reject</button>}
          </PermissionGate>
          <PermissionGate permission="van_unloading:delete">
            {sheet.status !== 'approved' && sheet.status !== 'cancelled' && (
              <button className="btn-danger" onClick={() => setReasonModal('cancel')} disabled={busy}><Ban size={14} /> Cancel</button>
            )}
          </PermissionGate>
        </div>

        {canApprove && (
          <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-900/20">
            <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">Approve this unloading</p>
            <SignaturePad label="Approver signature" onChange={setSignature} />
            <textarea className="input" rows={2} placeholder="Approval notes (optional)" value={approvalNotes} onChange={(e) => setApprovalNotes(e.target.value)} />
            <PermissionGate permission="van_unloading:approve">
              <button className="btn-primary w-full" onClick={handleApprove} disabled={approving}>
                <Check size={16} /> {approving ? 'Approving…' : 'Approve — update stock'}
              </button>
            </PermissionGate>
          </div>
        )}

        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">History</h3>
          <ApprovalHistoryList entityType="van_unloading" entityId={sheet.id} />
        </div>
      </div>

      <Modal open={!!reasonModal} onClose={() => setReasonModal(null)} title={reasonModal === 'reject' ? 'Reject unloading' : 'Cancel unloading'} size="sm">
        <div className="space-y-4">
          <label className="label">Reason *</label>
          <textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setReasonModal(null)} disabled={busy}>Back</button>
            <button className="btn-danger" onClick={handleReasonSubmit} disabled={busy || !reason.trim()}>Confirm</button>
          </div>
        </div>
      </Modal>
    </Modal>
  );
}

export function VanUnloadingPage() {
  const { unloadings, loading, reload } = useVanUnloadings();
  const [newOpen, setNewOpen] = useState(false);
  const [viewing, setViewing] = useState<VanUnloading | null>(null);

  const columns: Column<VanUnloading>[] = [
    { key: 'unloading_no', header: 'Unloading #', render: (r) => (
      <button className="font-medium text-brand-700 hover:underline dark:text-brand-400" onClick={() => setViewing(r)}>{r.unloading_no}</button>
    ) },
    { key: 'van', header: 'Van', render: (r) => r.van?.name ?? '—' },
    { key: 'warehouse', header: 'To warehouse', render: (r) => r.warehouse?.name ?? '—' },
    { key: 'created_at', header: 'Created', render: (r) => new Date(r.created_at).toLocaleString() },
    { key: 'status', header: 'Status', render: (r) => <span className={STATUS_BADGE[r.status]}>{r.status.replace('_', ' ')}</span> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Van Unloading</h1>
          <p className="text-sm text-slate-500">Return remaining stock, log damage/expiry, process customer returns, and verify variance. Click an unloading number for details.</p>
        </div>
        <PermissionGate permission="van_unloading:create">
          <button className="btn-primary" onClick={() => setNewOpen(true)}><Plus size={16} /> New unloading sheet</button>
        </PermissionGate>
      </div>

      <DataTable columns={columns} rows={unloadings} rowKey={(r) => r.id} loading={loading}
        emptyMessage="No unloading sheets yet." exportFilename="van-unloadings" />

      <NewUnloadingModal open={newOpen} onClose={() => setNewOpen(false)} onCreated={reload} />
      <UnloadingDetailModal unloading={viewing} onClose={() => setViewing(null)} onChanged={reload} />
    </div>
  );
}
