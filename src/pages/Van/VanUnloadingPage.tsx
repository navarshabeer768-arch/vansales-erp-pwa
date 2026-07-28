import { useState } from 'react';
import { Plus, Check, Trash2 } from 'lucide-react';
import { useVans } from '@/hooks/useVans';
import { useWarehouses } from '@/hooks/useWarehouses';
import { useVanUnloadings, useVanStock, VanUnloadingItemDraft, UnloadingItemType, VanUnloading } from '@/hooks/useVanUnloadings';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';

const TYPE_LABELS: Record<UnloadingItemType, string> = {
  remaining: 'Remaining (back to warehouse)',
  customer_return: 'Customer return (back to warehouse)',
  damaged: 'Damaged (written off)',
  expired: 'Expired (written off)',
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
              <thead><tr><th>Product</th><th>On van</th><th>Type</th><th>Qty</th><th></th></tr></thead>
              <tbody>
                {rows.map((r, idx) => {
                  const s = stock.find((x) => x.product_id === r.product_id && x.batch_id === r.batch_id);
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

export function VanUnloadingPage() {
  const { unloadings, loading, reload, approveUnloading } = useVanUnloadings();
  const { push } = useToast();
  const [newOpen, setNewOpen] = useState(false);
  const [toApprove, setToApprove] = useState<VanUnloading | null>(null);
  const [busy, setBusy] = useState(false);

  const handleApprove = async () => {
    if (!toApprove) return;
    setBusy(true);
    const { error } = await approveUnloading(toApprove.id);
    setBusy(false);
    setToApprove(null);
    push(error ? 'error' : 'success', error ?? 'Unloading approved — stock updated.');
  };

  const columns: Column<VanUnloading>[] = [
    { key: 'unloading_no', header: 'Unloading #', render: (r) => <span className="font-medium">{r.unloading_no}</span> },
    { key: 'van', header: 'Van', render: (r) => r.van?.name ?? '—' },
    { key: 'warehouse', header: 'To warehouse', render: (r) => r.warehouse?.name ?? '—' },
    { key: 'created_at', header: 'Created', render: (r) => new Date(r.created_at).toLocaleString() },
    { key: 'status', header: 'Status', render: (r) => (
      <span className={r.status === 'approved' ? 'badge-green' : r.status === 'rejected' ? 'badge-red' : 'badge-amber'}>{r.status.replace('_', ' ')}</span>
    ) },
    {
      key: 'actions', header: '', className: 'text-right',
      render: (r) => (
        <PermissionGate permission="van_unloading:approve">
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
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Van Unloading</h1>
          <p className="text-sm text-slate-500">Return remaining stock, log damage/expiry, and process customer returns.</p>
        </div>
        <PermissionGate permission="van_unloading:create">
          <button className="btn-primary" onClick={() => setNewOpen(true)}><Plus size={16} /> New unloading sheet</button>
        </PermissionGate>
      </div>

      <DataTable columns={columns} rows={unloadings} rowKey={(r) => r.id} loading={loading}
        emptyMessage="No unloading sheets yet." />

      <NewUnloadingModal open={newOpen} onClose={() => setNewOpen(false)} onCreated={reload} />

      <ConfirmDialog
        open={!!toApprove}
        title="Approve unloading sheet"
        message="Approving will update van and warehouse stock immediately — remaining/returns go back to the warehouse, damaged/expired items are written off. This cannot be undone."
        confirmLabel="Approve"
        danger={false}
        loading={busy}
        onConfirm={handleApprove}
        onCancel={() => setToApprove(null)}
      />
    </div>
  );
}
