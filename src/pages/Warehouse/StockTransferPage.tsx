import { useState, useEffect } from 'react';
import { Plus, Check, Trash2, ArrowRightLeft } from 'lucide-react';
import { useWarehouseTransfers, fetchTransferItems, TransferItemDraft, TransferItem, WarehouseTransfer } from '@/hooks/useWarehouseTransfers';
import { useWarehouses } from '@/hooks/useWarehouses';
import { useWarehouseStock } from '@/hooks/useWarehouseStock';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';

function NewTransferModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { warehouses } = useWarehouses();
  const { createTransfer } = useWarehouseTransfers();
  const { push } = useToast();

  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [items, setItems] = useState<TransferItemDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const { stock } = useWarehouseStock(fromId || null);

  const reset = () => { setFromId(''); setToId(''); setItems([]); };

  const addItem = (stockId: string) => {
    const s = stock.find((x) => x.id === stockId);
    if (!s || items.some((it) => it.product_id === s.product_id && it.batch_id === s.batch_id)) return;
    setItems((prev) => [...prev, { product_id: s.product_id, batch_id: s.batch_id, quantity: 1 }]);
  };
  const updateQty = (idx: number, qty: number) => setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, quantity: qty } : it)));
  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const submit = async () => {
    if (!fromId || !toId) { push('error', 'Select both warehouses.'); return; }
    for (const it of items) {
      const s = stock.find((x) => x.product_id === it.product_id && x.batch_id === it.batch_id);
      if (s && it.quantity > s.quantity) {
        push('error', `Requested quantity for ${s.product?.name} exceeds available stock (${s.quantity}).`);
        return;
      }
    }
    setSubmitting(true);
    const { error } = await createTransfer(fromId, toId, items);
    setSubmitting(false);
    if (error) { push('error', error); return; }
    push('success', 'Transfer created — pending approval.');
    reset();
    onCreated();
    onClose();
  };

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title="New stock transfer" size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">From warehouse *</label>
            <select className="input" value={fromId} onChange={(e) => { setFromId(e.target.value); setItems([]); }}>
              <option value="">Select…</option>
              {warehouses.filter((w) => w.is_active).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">To warehouse *</label>
            <select className="input" value={toId} onChange={(e) => setToId(e.target.value)}>
              <option value="">Select…</option>
              {warehouses.filter((w) => w.is_active && w.id !== fromId).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
        </div>

        {fromId && (
          <div>
            <label className="label">Add product from source warehouse stock</label>
            <select className="input" value="" onChange={(e) => e.target.value && addItem(e.target.value)}>
              <option value="">Select a product…</option>
              {stock.map((s) => (
                <option key={s.id} value={s.id} disabled={s.quantity <= 0}>
                  {s.product?.name} {s.batch?.batch_no ? `(Batch ${s.batch.batch_no})` : ''} — available {s.quantity}
                </option>
              ))}
            </select>
          </div>
        )}

        {items.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="table-base">
              <thead><tr><th>Product</th><th>Available</th><th>Transfer qty</th><th></th></tr></thead>
              <tbody>
                {items.map((it, idx) => {
                  const s = stock.find((x) => x.product_id === it.product_id && x.batch_id === it.batch_id);
                  return (
                    <tr key={idx}>
                      <td>{s?.product?.name}</td>
                      <td>{s?.quantity}</td>
                      <td>
                        <input type="number" min={0.001} step="0.001" className="input !w-24 !py-1.5"
                          value={it.quantity} onChange={(e) => updateQty(idx, Number(e.target.value))} />
                      </td>
                      <td><button onClick={() => removeItem(idx)} className="text-slate-400 hover:text-red-600"><Trash2 size={16} /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={() => { reset(); onClose(); }} disabled={submitting}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={submitting || items.length === 0}>
            {submitting ? 'Creating…' : 'Submit for approval'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function TransferItemsModal({ transfer, onClose }: { transfer: WarehouseTransfer | null; onClose: () => void }) {
  const [items, setItems] = useState<TransferItem[]>([]);
  useEffect(() => { if (transfer) fetchTransferItems(transfer.id).then(setItems); }, [transfer]);

  return (
    <Modal open={!!transfer} onClose={onClose} title={transfer ? `Items — ${transfer.transfer_no}` : ''} size="lg">
      <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="table-base">
          <thead><tr><th>Product</th><th>Quantity</th></tr></thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id}><td>{it.product?.name}</td><td>{it.quantity}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

export function StockTransferPage() {
  const { transfers, loading, reload, approveTransfer } = useWarehouseTransfers();
  const { push } = useToast();
  const [newOpen, setNewOpen] = useState(false);
  const [viewing, setViewing] = useState<WarehouseTransfer | null>(null);
  const [toApprove, setToApprove] = useState<WarehouseTransfer | null>(null);
  const [busy, setBusy] = useState(false);

  const handleApprove = async () => {
    if (!toApprove) return;
    setBusy(true);
    const { error } = await approveTransfer(toApprove.id);
    setBusy(false);
    setToApprove(null);
    push(error ? 'error' : 'success', error ?? 'Transfer approved — stock moved.');
  };

  const columns: Column<WarehouseTransfer>[] = [
    { key: 'transfer_no', header: 'Transfer #', render: (r) => (
      <button className="font-medium text-brand-700 hover:underline dark:text-brand-400" onClick={() => setViewing(r)}>{r.transfer_no}</button>
    ) },
    { key: 'from', header: 'From', render: (r) => r.from_warehouse?.name ?? '—' },
    { key: 'to', header: 'To', render: (r) => r.to_warehouse?.name ?? '—' },
    { key: 'status', header: 'Status', render: (r) => (
      <span className={r.status === 'completed' ? 'badge-green' : r.status === 'cancelled' ? 'badge-red' : 'badge-amber'}>{r.status}</span>
    ) },
    { key: 'created_at', header: 'Created', render: (r) => new Date(r.created_at).toLocaleString() },
    {
      key: 'actions', header: '', className: 'text-right',
      render: (r) => (
        <PermissionGate permission="warehouse:approve">
          {r.status === 'pending' && <button className="btn-secondary !py-1" onClick={() => setToApprove(r)}><Check size={14} /> Approve</button>}
        </PermissionGate>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Stock Transfers</h1>
          <p className="text-sm text-slate-500">Move stock between warehouses. Approval updates both sides atomically.</p>
        </div>
        <PermissionGate permission="warehouse:create">
          <button className="btn-primary" onClick={() => setNewOpen(true)}><Plus size={16} /> New transfer</button>
        </PermissionGate>
      </div>

      {transfers.length === 0 && !loading ? (
        <div className="card flex flex-col items-center gap-2 p-10 text-center">
          <ArrowRightLeft className="text-slate-300" size={36} />
          <p className="font-medium text-slate-600 dark:text-slate-300">No transfers yet</p>
        </div>
      ) : (
        <DataTable columns={columns} rows={transfers} rowKey={(r) => r.id} loading={loading} exportFilename="stock-transfers" />
      )}

      <NewTransferModal open={newOpen} onClose={() => setNewOpen(false)} onCreated={reload} />
      <TransferItemsModal transfer={viewing} onClose={() => setViewing(null)} />

      <ConfirmDialog
        open={!!toApprove}
        title="Approve transfer"
        message="Approving will move this stock between the two warehouses immediately. This cannot be undone."
        confirmLabel="Approve"
        danger={false}
        loading={busy}
        onConfirm={handleApprove}
        onCancel={() => setToApprove(null)}
      />
    </div>
  );
}
