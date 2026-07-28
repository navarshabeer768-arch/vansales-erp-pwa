import { useParams, Link } from 'react-router-dom';
import { useState } from 'react';
import { ArrowLeft, Plus, Check, Trash2 } from 'lucide-react';
import { useWarehouses } from '@/hooks/useWarehouses';
import { useWarehouseStock } from '@/hooks/useWarehouseStock';
import { useStockAdjustments, AdjustmentDraftItem } from '@/hooks/useWarehouseStock';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';
import type { StockAdjustment } from '@/types/database';

function NewAdjustmentModal({ warehouseId, open, onClose, onCreated }: {
  warehouseId: string; open: boolean; onClose: () => void; onCreated: () => void;
}) {
  const { stock } = useWarehouseStock(warehouseId);
  const { createAdjustment } = useStockAdjustments(warehouseId);
  const { push } = useToast();
  const [type, setType] = useState<StockAdjustment['adjustment_type']>('count');
  const [reason, setReason] = useState('');
  const [rows, setRows] = useState<AdjustmentDraftItem[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const addRow = (stockId: string) => {
    const s = stock.find((x) => x.id === stockId);
    if (!s || rows.some((r) => r.product_id === s.product_id && r.batch_id === s.batch_id)) return;
    setRows((prev) => [...prev, {
      product_id: s.product_id, batch_id: s.batch_id, system_quantity: s.quantity, counted_quantity: s.quantity,
    }]);
  };

  const updateCounted = (idx: number, value: number) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, counted_quantity: value } : r)));
  };

  const removeRow = (idx: number) => setRows((prev) => prev.filter((_, i) => i !== idx));

  const submit = async () => {
    setSubmitting(true);
    const { error } = await createAdjustment(type, reason, rows);
    setSubmitting(false);
    if (error) { push('error', error); return; }
    push('success', 'Adjustment submitted for approval.');
    setRows([]); setReason('');
    onCreated();
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="New stock adjustment" size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Type</label>
            <select className="input" value={type} onChange={(e) => setType(e.target.value as any)}>
              <option value="count">Stock count</option>
              <option value="damage">Damaged stock</option>
              <option value="loss">Lost stock</option>
              <option value="correction">Correction</option>
            </select>
          </div>
          <div>
            <label className="label">Reason / note</label>
            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Monthly cycle count" />
          </div>
        </div>

        <div>
          <label className="label">Add product from current stock</label>
          <select className="input" onChange={(e) => e.target.value && addRow(e.target.value)} value="">
            <option value="">Select a product…</option>
            {stock.map((s) => (
              <option key={s.id} value={s.id}>
                {s.product?.name} {s.batch?.batch_no ? `(Batch ${s.batch.batch_no})` : ''} — system qty {s.quantity}
              </option>
            ))}
          </select>
        </div>

        {rows.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="table-base">
              <thead><tr><th>Product</th><th>System qty</th><th>Counted qty</th><th>Difference</th><th></th></tr></thead>
              <tbody>
                {rows.map((r, idx) => {
                  const productName = stock.find((s) => s.product_id === r.product_id)?.product?.name ?? '—';
                  const diff = r.counted_quantity - r.system_quantity;
                  return (
                    <tr key={idx}>
                      <td>{productName}</td>
                      <td>{r.system_quantity}</td>
                      <td>
                        <input
                          type="number" step="0.001" className="input !py-1.5"
                          value={r.counted_quantity}
                          onChange={(e) => updateCounted(idx, Number(e.target.value))}
                        />
                      </td>
                      <td className={diff === 0 ? 'text-slate-500' : diff > 0 ? 'text-emerald-600' : 'text-red-600'}>
                        {diff > 0 ? `+${diff}` : diff}
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
          <button className="btn-secondary" onClick={onClose} disabled={submitting}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={submitting || rows.length === 0}>
            {submitting ? 'Submitting…' : 'Submit for approval'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function StockAdjustmentPage() {
  const { warehouseId } = useParams<{ warehouseId: string }>();
  const { warehouses } = useWarehouses();
  const { adjustments, loading, reload, approveAdjustment } = useStockAdjustments(warehouseId ?? null);
  const { push } = useToast();
  const warehouse = warehouses.find((w) => w.id === warehouseId);
  const [newOpen, setNewOpen] = useState(false);
  const [toApprove, setToApprove] = useState<StockAdjustment | null>(null);
  const [busy, setBusy] = useState(false);

  const handleApprove = async () => {
    if (!toApprove) return;
    setBusy(true);
    const { error } = await approveAdjustment(toApprove.id);
    setBusy(false);
    setToApprove(null);
    push(error ? 'error' : 'success', error ?? 'Adjustment approved and stock updated.');
  };

  const columns: Column<StockAdjustment>[] = [
    { key: 'type', header: 'Type', render: (r) => <span className="capitalize">{r.adjustment_type}</span> },
    { key: 'reason', header: 'Reason', render: (r) => r.reason || '—' },
    { key: 'created_at', header: 'Created', render: (r) => new Date(r.created_at).toLocaleString() },
    {
      key: 'status', header: 'Status',
      render: (r) => (
        <span className={r.status === 'approved' ? 'badge-green' : r.status === 'rejected' ? 'badge-red' : 'badge-amber'}>
          {r.status}
        </span>
      ),
    },
    {
      key: 'actions', header: '', className: 'text-right',
      render: (r) => (
        <PermissionGate permission="warehouse:approve">
          {r.status === 'pending' && (
            <button className="btn-secondary !py-1" onClick={() => setToApprove(r)}>
              <Check size={14} /> Approve
            </button>
          )}
        </PermissionGate>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link to={`/warehouse/stock/${warehouseId}`} className="btn-ghost !px-2 !py-1"><ArrowLeft size={18} /></Link>
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">{warehouse?.name} — Stock Adjustments</h1>
          <p className="text-sm text-slate-500">Counts, damage, and loss require approval before stock updates.</p>
        </div>
        <PermissionGate permission="warehouse:create">
          <button className="btn-primary ml-auto" onClick={() => setNewOpen(true)}><Plus size={16} /> New adjustment</button>
        </PermissionGate>
      </div>

      <DataTable columns={columns} rows={adjustments} rowKey={(r) => r.id} loading={loading}
        emptyMessage="No adjustments recorded yet." />

      {warehouseId && (
        <NewAdjustmentModal warehouseId={warehouseId} open={newOpen} onClose={() => setNewOpen(false)} onCreated={reload} />
      )}

      <ConfirmDialog
        open={!!toApprove}
        title="Approve adjustment"
        message="Approving will immediately update warehouse stock quantities and cannot be undone. Continue?"
        confirmLabel="Approve"
        danger={false}
        loading={busy}
        onConfirm={handleApprove}
        onCancel={() => setToApprove(null)}
      />
    </div>
  );
}
