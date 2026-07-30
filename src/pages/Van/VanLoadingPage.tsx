import { useState, useEffect } from 'react';
import { Plus, Check, Trash2, Zap, X, RotateCcw, Ban, Printer, FileText } from 'lucide-react';
import { useVans } from '@/hooks/useVans';
import { useMyVanIds } from '@/hooks/useVanAssignments';
import { useWarehouses } from '@/hooks/useWarehouses';
import { useWarehouseStock } from '@/hooks/useWarehouseStock';
import { useVanLoadings, VanLoadingItemDraft, VanLoading, VanLoadingItemRow, fetchLoadingItems } from '@/hooks/useVanLoadings';
import { useStockAllocation } from '@/hooks/useStockAllocation';
import { useAuth } from '@/contexts/AuthContext';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SignaturePad } from '@/components/common/SignaturePad';
import { ApprovalHistoryList } from '@/components/common/ApprovalHistoryList';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';
import { printDocument } from '@/lib/documentPrint';

function NewLoadingModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { vans } = useVans();
  const myVanIds = useMyVanIds();
  const accessibleVans = myVanIds === null ? vans : vans.filter((v) => myVanIds.has(v.id));
  const { warehouses } = useWarehouses();
  const { createLoading } = useVanLoadings();
  const { push } = useToast();

  const [vanId, setVanId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [rows, setRows] = useState<VanLoadingItemDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const { stock } = useWarehouseStock(warehouseId || null);
  const { allocating, allocateFifo } = useStockAllocation();
  const [fifoProductId, setFifoProductId] = useState('');
  const [fifoQuantity, setFifoQuantity] = useState(1);

  const uniqueProducts = Array.from(
    new Map(stock.filter((s) => s.quantity > 0).map((s) => [s.product_id, s.product])).entries()
  ).map(([id, product]) => ({ id, product }));

  const addRowsFromFifo = async () => {
    if (!fifoProductId || fifoQuantity <= 0) { push('error', 'Select a product and a quantity.'); return; }
    const { allocations, error } = await allocateFifo('warehouse', warehouseId, fifoProductId, fifoQuantity);
    if (error) { push('error', error); return; }
    setRows((prev) => {
      const next = [...prev];
      for (const a of allocations) {
        const existingIdx = next.findIndex((r) => r.product_id === fifoProductId && r.batch_id === a.batch_id);
        if (existingIdx >= 0) next[existingIdx] = { ...next[existingIdx], quantity_requested: next[existingIdx].quantity_requested + a.allocated_quantity };
        else next.push({ product_id: fifoProductId, batch_id: a.batch_id, quantity_requested: a.allocated_quantity });
      }
      return next;
    });
    push('success', `Allocated ${fifoQuantity} across ${allocations.length} batch${allocations.length === 1 ? '' : 'es'} (oldest expiry first).`);
    setFifoProductId(''); setFifoQuantity(1);
  };

  const addRow = (stockId: string) => {
    const s = stock.find((x) => x.id === stockId);
    if (!s) return;
    // Duplicate-product guard: same product+batch already on the sheet just gets its quantity bumped, matching the DB-level uniqueness this phase added.
    const existingIdx = rows.findIndex((r) => r.product_id === s.product_id && r.batch_id === s.batch_id);
    if (existingIdx >= 0) {
      setRows((prev) => prev.map((r, i) => (i === existingIdx ? { ...r, quantity_requested: r.quantity_requested + 1 } : r)));
      return;
    }
    setRows((prev) => [...prev, { product_id: s.product_id, batch_id: s.batch_id, quantity_requested: 1 }]);
  };

  const updateQty = (idx: number, qty: number) => setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, quantity_requested: qty } : r)));
  const removeRow = (idx: number) => setRows((prev) => prev.filter((_, i) => i !== idx));

  const reset = () => { setVanId(''); setWarehouseId(''); setRows([]); setFifoProductId(''); setFifoQuantity(1); };

  const submit = async () => {
    if (!vanId || !warehouseId) { push('error', 'Select a van and a source warehouse.'); return; }
    for (const r of rows) {
      const s = stock.find((x) => x.product_id === r.product_id && x.batch_id === r.batch_id);
      if (s && r.quantity_requested > s.quantity) {
        push('error', `Requested quantity for ${s.product?.name} exceeds available stock (${s.quantity}).`);
        return;
      }
    }
    setSubmitting(true);
    const { error } = await createLoading(vanId, warehouseId, rows);
    setSubmitting(false);
    if (error) { push('error', error); return; }
    push('success', 'Loading sheet saved as draft.');
    reset();
    onCreated();
    onClose();
  };

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title="New van loading sheet" size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Van</label>
            <select className="input" value={vanId} onChange={(e) => setVanId(e.target.value)}>
              <option value="">Select a van…</option>
              {accessibleVans.filter((v) => v.status === 'active').map((v) => <option key={v.id} value={v.id}>{v.name} ({v.code})</option>)}
            </select>
          </div>
          <div>
            <label className="label">Source warehouse</label>
            <select className="input" value={warehouseId} onChange={(e) => { setWarehouseId(e.target.value); setRows([]); }}>
              <option value="">Select a warehouse…</option>
              {warehouses.filter((w) => w.is_active).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
        </div>

        {warehouseId && (
          <div className="rounded-lg border border-brand-200 bg-brand-50 p-3 dark:border-brand-900 dark:bg-brand-900/20">
            <label className="label flex items-center gap-1.5"><Zap size={14} className="text-brand-600" /> Auto-add by quantity (FIFO — oldest expiry first)</label>
            <div className="flex gap-2">
              <select className="input" value={fifoProductId} onChange={(e) => setFifoProductId(e.target.value)}>
                <option value="">Select a product…</option>
                {uniqueProducts.map(({ id, product }) => <option key={id} value={id}>{product?.name}</option>)}
              </select>
              <input type="number" min={1} step="0.001" className="input !w-28" value={fifoQuantity}
                onChange={(e) => setFifoQuantity(Number(e.target.value))} />
              <button type="button" className="btn-primary shrink-0" onClick={addRowsFromFifo} disabled={allocating}>
                {allocating ? 'Allocating…' : 'Add'}
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">Automatically splits across batches oldest-expiry-first if one batch doesn't cover the full quantity.</p>
          </div>
        )}

        {warehouseId && (
          <div>
            <label className="label">Or pick an exact batch manually</label>
            <select className="input" value="" onChange={(e) => e.target.value && addRow(e.target.value)}>
              <option value="">Select a product…</option>
              {stock.map((s) => (
                <option key={s.id} value={s.id} disabled={s.quantity <= 0}>
                  {s.product?.name} {s.batch?.batch_no ? `(Batch ${s.batch.batch_no})` : ''} — available {s.quantity}
                </option>
              ))}
            </select>
          </div>
        )}

        {rows.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="table-base">
              <thead><tr><th>Product</th><th>Available</th><th>Load qty</th><th></th></tr></thead>
              <tbody>
                {rows.map((r, idx) => {
                  const s = stock.find((x) => x.product_id === r.product_id && x.batch_id === r.batch_id);
                  return (
                    <tr key={idx}>
                      <td>{s?.product?.name}</td>
                      <td>{s?.quantity}</td>
                      <td>
                        <input type="number" min={0} step="0.001" className="input !py-1.5"
                          value={r.quantity_requested} onChange={(e) => updateQty(idx, Number(e.target.value))} />
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
            {submitting ? 'Saving…' : 'Save as draft'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

const STATUS_BADGE: Record<string, string> = {
  draft: 'badge-slate', pending_approval: 'badge-amber', approved: 'badge-green',
  rejected: 'badge-red', reopened: 'badge-amber', cancelled: 'badge-red',
};

function LoadingDetailModal({ loading: sheet, onClose, onChanged }: { loading: VanLoading | null; onClose: () => void; onChanged: () => void }) {
  const { company, user } = useAuth();
  const { submitLoading, rejectLoading, reopenLoading, cancelLoading, recordPick, approveLoading } = useVanLoadings();
  const { push } = useToast();
  const [items, setItems] = useState<VanLoadingItemRow[]>([]);
  const [reasonModal, setReasonModal] = useState<'reject' | 'cancel' | null>(null);
  const [reason, setReason] = useState('');
  const [approving, setApproving] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (sheet) fetchLoadingItems(sheet.id).then(setItems); }, [sheet]);

  if (!sheet) return null;

  const reloadItems = () => fetchLoadingItems(sheet.id).then(setItems);

  const handleSubmit = async () => {
    setBusy(true);
    const { error } = await submitLoading(sheet.id);
    setBusy(false);
    push(error ? 'error' : 'success', error ?? 'Submitted for approval.');
    onChanged();
  };

  const handlePick = async (itemId: string, qty: number) => {
    const { error } = await recordPick(itemId, qty);
    if (error) push('error', error);
    else reloadItems();
  };

  const handleApprove = async () => {
    setApproving(true);
    const { error } = await approveLoading(sheet.id, approvalNotes || undefined, signature ?? undefined);
    setApproving(false);
    push(error ? 'error' : 'success', error ?? 'Approved — stock moved to the van.');
    if (!error) onChanged();
  };

  const handleReasonSubmit = async () => {
    if (!reason.trim()) { push('error', 'A reason is required.'); return; }
    setBusy(true);
    const { error } = reasonModal === 'reject' ? await rejectLoading(sheet.id, reason) : await cancelLoading(sheet.id, reason);
    setBusy(false);
    setReasonModal(null);
    setReason('');
    push(error ? 'error' : 'success', error ?? (reasonModal === 'reject' ? 'Loading rejected.' : 'Loading cancelled.'));
    onChanged();
  };

  const handleReopen = async () => {
    setBusy(true);
    const { error } = await reopenLoading(sheet.id);
    setBusy(false);
    push(error ? 'error' : 'success', error ?? 'Reopened as draft.');
    onChanged();
  };

  const printLoadingSheet = () => {
    printDocument({
      title: 'Van Loading Sheet', subtitle: sheet.loading_no,
      meta: [
        { label: 'Van', value: sheet.van?.name ?? '—' }, { label: 'Warehouse', value: sheet.warehouse?.name ?? '—' },
        { label: 'Date', value: new Date(sheet.created_at).toLocaleDateString() }, { label: 'Status', value: sheet.status },
        { label: 'Store', value: company?.name ?? '—' },
      ],
      columns: [{ header: 'Product' }, { header: 'Batch' }, { header: 'Requested', align: 'right' }, { header: 'Verified', align: 'right' }],
      rows: items.map((i) => [i.product?.name ?? '—', i.batch?.batch_no ?? '—', i.quantity_requested, i.quantity_verified ?? i.quantity_requested]),
      signatureLabel: 'Loaded By',
    });
  };

  const printPickingList = () => {
    printDocument({
      title: 'Picking List', subtitle: sheet.loading_no,
      meta: [{ label: 'Warehouse', value: sheet.warehouse?.name ?? '—' }, { label: 'Van', value: sheet.van?.name ?? '—' }],
      columns: [{ header: 'Product' }, { header: 'Batch' }, { header: 'Requested Qty', align: 'right' }, { header: 'Picked Qty', align: 'right' }, { header: 'Picker' }],
      rows: items.map((i) => [i.product?.name ?? '—', i.batch?.batch_no ?? '—', i.quantity_requested, i.quantity_verified ?? '', '']),
      signatureLabel: 'Picked By',
    });
  };

  const canEdit = sheet.status === 'draft' || sheet.status === 'reopened';
  const canSubmit = canEdit;
  const canApprove = sheet.status === 'pending_approval';

  return (
    <Modal open={!!sheet} onClose={onClose} title={`Loading ${sheet.loading_no}`} size="lg">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className={STATUS_BADGE[sheet.status]}>{sheet.status.replace('_', ' ')}</span>
          <div className="flex gap-2">
            <button className="btn-secondary !py-1" onClick={printLoadingSheet}><Printer size={14} /> Loading Sheet</button>
            <button className="btn-secondary !py-1" onClick={printPickingList}><FileText size={14} /> Picking List</button>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="table-base">
            <thead><tr><th>Product</th><th>Batch</th><th>Requested</th><th>Picked qty</th></tr></thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <td>{i.product?.name}</td>
                  <td>{i.batch?.batch_no ?? '—'}</td>
                  <td>{i.quantity_requested}</td>
                  <td>
                    {canEdit || canApprove ? (
                      <input
                        type="number" min={0} step="0.001" className="input !w-24 !py-1.5"
                        defaultValue={i.quantity_verified ?? i.quantity_requested}
                        onBlur={(e) => handlePick(i.id, Number(e.target.value))}
                      />
                    ) : (i.quantity_verified ?? i.quantity_requested)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <PermissionGate permission="van_loading:create">
            {canSubmit && <button className="btn-primary" onClick={handleSubmit} disabled={busy}>Submit for approval</button>}
          </PermissionGate>
          <PermissionGate permission="van_loading:approve">
            {(sheet.status === 'rejected' || sheet.status === 'pending_approval') && (
              <button className="btn-secondary" onClick={handleReopen} disabled={busy}><RotateCcw size={14} /> Reopen</button>
            )}
            {canApprove && <button className="btn-danger" onClick={() => setReasonModal('reject')} disabled={busy}><X size={14} /> Reject</button>}
          </PermissionGate>
          <PermissionGate permission="van_loading:delete">
            {sheet.status !== 'approved' && sheet.status !== 'cancelled' && (
              <button className="btn-danger" onClick={() => setReasonModal('cancel')} disabled={busy}><Ban size={14} /> Cancel</button>
            )}
          </PermissionGate>
        </div>

        {canApprove && (
          <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-900/20">
            <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">Approve this loading</p>
            <SignaturePad label="Approver signature" onChange={setSignature} />
            <textarea className="input" rows={2} placeholder="Approval notes (optional)" value={approvalNotes} onChange={(e) => setApprovalNotes(e.target.value)} />
            <PermissionGate permission="van_loading:approve">
              <button className="btn-primary w-full" onClick={handleApprove} disabled={approving}>
                <Check size={16} /> {approving ? 'Approving…' : 'Approve — move stock to van'}
              </button>
            </PermissionGate>
          </div>
        )}

        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">History</h3>
          <ApprovalHistoryList entityType="van_loading" entityId={sheet.id} />
        </div>
      </div>

      <Modal open={!!reasonModal} onClose={() => setReasonModal(null)} title={reasonModal === 'reject' ? 'Reject loading' : 'Cancel loading'} size="sm">
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

export function VanLoadingPage() {
  const { loadings, loading, reload } = useVanLoadings();
  const [newOpen, setNewOpen] = useState(false);
  const [viewing, setViewing] = useState<VanLoading | null>(null);

  const columns: Column<VanLoading>[] = [
    { key: 'loading_no', header: 'Loading #', render: (r) => (
      <button className="font-medium text-brand-700 hover:underline dark:text-brand-400" onClick={() => setViewing(r)}>{r.loading_no}</button>
    ) },
    { key: 'van', header: 'Van', render: (r) => r.van?.name ?? '—' },
    { key: 'warehouse', header: 'From warehouse', render: (r) => r.warehouse?.name ?? '—' },
    { key: 'created_at', header: 'Created', render: (r) => new Date(r.created_at).toLocaleString() },
    { key: 'status', header: 'Status', render: (r) => <span className={STATUS_BADGE[r.status]}>{r.status.replace('_', ' ')}</span> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Van Loading</h1>
          <p className="text-sm text-slate-500">Draft → Submit → Approve/Reject, with picking verification and full history. Click a loading number for details.</p>
        </div>
        <PermissionGate permission="van_loading:create">
          <button className="btn-primary" onClick={() => setNewOpen(true)}><Plus size={16} /> New loading sheet</button>
        </PermissionGate>
      </div>

      <DataTable columns={columns} rows={loadings} rowKey={(r) => r.id} loading={loading}
        emptyMessage="No loading sheets yet." exportFilename="van-loadings" />

      <NewLoadingModal open={newOpen} onClose={() => setNewOpen(false)} onCreated={reload} />
      <LoadingDetailModal loading={viewing} onClose={() => setViewing(null)} onChanged={reload} />
    </div>
  );
}
