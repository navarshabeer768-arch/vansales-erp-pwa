import { useState } from 'react';
import { Plus, Check, Trash2, Zap } from 'lucide-react';
import { useVans } from '@/hooks/useVans';
import { useWarehouses } from '@/hooks/useWarehouses';
import { useWarehouseStock } from '@/hooks/useWarehouseStock';
import { useVanLoadings, VanLoadingItemDraft, VanLoading } from '@/hooks/useVanLoadings';
import { useStockAllocation } from '@/hooks/useStockAllocation';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';

function NewLoadingModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { vans } = useVans();
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

  // Unique products available in this warehouse (batches are chosen automatically by FIFO/expiry priority).
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
    if (!s || rows.some((r) => r.product_id === s.product_id && r.batch_id === s.batch_id)) return;
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
    push('success', 'Loading sheet created — pending approval.');
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
              {vans.filter((v) => v.status === 'active').map((v) => <option key={v.id} value={v.id}>{v.name} ({v.code})</option>)}
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
            {submitting ? 'Submitting…' : 'Submit for approval'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function VanLoadingPage() {
  const { loadings, loading, reload, approveLoading } = useVanLoadings();
  const { push } = useToast();
  const [newOpen, setNewOpen] = useState(false);
  const [toApprove, setToApprove] = useState<VanLoading | null>(null);
  const [busy, setBusy] = useState(false);

  const handleApprove = async () => {
    if (!toApprove) return;
    setBusy(true);
    const { error } = await approveLoading(toApprove.id);
    setBusy(false);
    setToApprove(null);
    push(error ? 'error' : 'success', error ?? 'Loading approved — stock moved to the van.');
  };

  const columns: Column<VanLoading>[] = [
    { key: 'loading_no', header: 'Loading #', render: (r) => <span className="font-medium">{r.loading_no}</span> },
    { key: 'van', header: 'Van', render: (r) => r.van?.name ?? '—' },
    { key: 'warehouse', header: 'From warehouse', render: (r) => r.warehouse?.name ?? '—' },
    { key: 'created_at', header: 'Created', render: (r) => new Date(r.created_at).toLocaleString() },
    { key: 'status', header: 'Status', render: (r) => (
      <span className={r.status === 'approved' ? 'badge-green' : r.status === 'rejected' ? 'badge-red' : 'badge-amber'}>{r.status.replace('_', ' ')}</span>
    ) },
    {
      key: 'actions', header: '', className: 'text-right',
      render: (r) => (
        <PermissionGate permission="van_loading:approve">
          {r.status === 'pending_approval' && (
            <button className="btn-secondary !py-1" onClick={() => setToApprove(r)}><Check size={14} /> Approve</button>
          )}
        </PermissionGate>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Van Loading</h1>
          <p className="text-sm text-slate-500">Move stock from a warehouse onto a van. Approval updates stock atomically.</p>
        </div>
        <PermissionGate permission="van_loading:create">
          <button className="btn-primary" onClick={() => setNewOpen(true)}><Plus size={16} /> New loading sheet</button>
        </PermissionGate>
      </div>

      <DataTable columns={columns} rows={loadings} rowKey={(r) => r.id} loading={loading}
        emptyMessage="No loading sheets yet." />

      <NewLoadingModal open={newOpen} onClose={() => setNewOpen(false)} onCreated={reload} />

      <ConfirmDialog
        open={!!toApprove}
        title="Approve loading sheet"
        message={`Approving will move stock from ${toApprove?.warehouse?.name ?? 'the warehouse'} onto ${toApprove?.van?.name ?? 'the van'} immediately. This cannot be undone.`}
        confirmLabel="Approve"
        danger={false}
        loading={busy}
        onConfirm={handleApprove}
        onCancel={() => setToApprove(null)}
      />
    </div>
  );
}
