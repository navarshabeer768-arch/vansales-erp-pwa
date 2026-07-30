import { useState, useEffect } from 'react';
import { Plus, Check, Trash2, ArrowRightLeft, PackageCheck } from 'lucide-react';
import { useVanTransfers, fetchVanTransferItems, VanTransferItemDraft, VanTransferItem, VanTransfer } from '@/hooks/useVanTransfers';
import { useVans } from '@/hooks/useVans';
import { useVanStock } from '@/hooks/useVanUnloadings';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';

function NewVanTransferModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { vans } = useVans();
  const { createTransfer } = useVanTransfers();
  const { push } = useToast();

  const [fromVanId, setFromVanId] = useState('');
  const [toVanId, setToVanId] = useState('');
  const [isEmergency, setIsEmergency] = useState(false);
  const [items, setItems] = useState<VanTransferItemDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const { stock } = useVanStock(fromVanId || null);

  const reset = () => { setFromVanId(''); setToVanId(''); setIsEmergency(false); setItems([]); };

  const addItem = (stockId: string) => {
    const s = stock.find((x) => x.id === stockId);
    if (!s || items.some((it) => it.product_id === s.product_id && it.batch_id === s.batch_id)) return;
    setItems((prev) => [...prev, { product_id: s.product_id, batch_id: s.batch_id, quantity: 1 }]);
  };
  const updateQty = (idx: number, qty: number) => setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, quantity: qty } : it)));
  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const submit = async () => {
    if (!fromVanId || !toVanId) { push('error', 'Select both vans.'); return; }
    for (const it of items) {
      const s = stock.find((x) => x.product_id === it.product_id && x.batch_id === it.batch_id);
      if (s && it.quantity > s.quantity) {
        push('error', `Requested quantity for ${s.product?.name} exceeds available stock (${s.quantity}).`);
        return;
      }
    }
    setSubmitting(true);
    const { error } = await createTransfer(fromVanId, toVanId, items, isEmergency);
    setSubmitting(false);
    if (error) { push('error', error); return; }
    push('success', 'Van transfer created — pending approval.');
    reset();
    onCreated();
    onClose();
  };

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title="New van-to-van transfer" size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">From van *</label>
            <select className="input" value={fromVanId} onChange={(e) => { setFromVanId(e.target.value); setItems([]); }}>
              <option value="">Select…</option>
              {vans.filter((v) => v.status === 'active').map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">To van *</label>
            <select className="input" value={toVanId} onChange={(e) => setToVanId(e.target.value)}>
              <option value="">Select…</option>
              {vans.filter((v) => v.status === 'active' && v.id !== fromVanId).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isEmergency} onChange={(e) => setIsEmergency(e.target.checked)} />
          Emergency transfer (out-of-cycle, e.g. a van ran out mid-route)
        </label>

        {fromVanId && (
          <div>
            <label className="label">Add product from source van stock</label>
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
              <thead><tr><th>Product</th><th>Available</th><th>Transfer qty (partial OK)</th><th></th></tr></thead>
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

function TransferItemsModal({ transfer, onClose }: { transfer: VanTransfer | null; onClose: () => void }) {
  const [items, setItems] = useState<VanTransferItem[]>([]);
  useEffect(() => { if (transfer) fetchVanTransferItems(transfer.id).then(setItems); }, [transfer]);

  return (
    <Modal open={!!transfer} onClose={onClose} title={transfer ? `Items — ${transfer.transfer_no}` : ''} size="lg">
      <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="table-base">
          <thead><tr><th>Product</th><th>Quantity</th></tr></thead>
          <tbody>
            {items.map((it) => <tr key={it.id}><td>{it.product?.name}</td><td>{it.quantity}</td></tr>)}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

export function VanTransferPage() {
  const { transfers, loading, reload, approveTransfer, markReceived } = useVanTransfers();
  const { push } = useToast();
  const [newOpen, setNewOpen] = useState(false);
  const [viewing, setViewing] = useState<VanTransfer | null>(null);
  const [toApprove, setToApprove] = useState<VanTransfer | null>(null);
  const [busy, setBusy] = useState(false);

  const handleApprove = async () => {
    if (!toApprove) return;
    setBusy(true);
    const { error } = await approveTransfer(toApprove.id);
    setBusy(false);
    setToApprove(null);
    push(error ? 'error' : 'success', error ?? 'Transfer approved — stock moved.');
  };

  const handleReceive = async (id: string) => {
    const { error } = await markReceived(id);
    push(error ? 'error' : 'success', error ?? 'Marked as received.');
  };

  const columns: Column<VanTransfer>[] = [
    { key: 'transfer_no', header: 'Transfer #', render: (r) => (
      <button className="font-medium text-brand-700 hover:underline dark:text-brand-400" onClick={() => setViewing(r)}>
        {r.transfer_no} {r.is_emergency && <span className="badge-red ml-1">Emergency</span>}
      </button>
    ) },
    { key: 'from', header: 'From van', render: (r) => r.from_van?.name ?? '—' },
    { key: 'to', header: 'To van', render: (r) => r.to_van?.name ?? '—' },
    { key: 'status', header: 'Status', render: (r) => (
      <span className={r.status === 'approved' ? 'badge-green' : r.status === 'cancelled' || r.status === 'rejected' ? 'badge-red' : 'badge-amber'}>{r.status}</span>
    ) },
    { key: 'received', header: 'Received', render: (r) => r.received_at ? new Date(r.received_at).toLocaleString() : '—' },
    { key: 'created_at', header: 'Created', render: (r) => new Date(r.created_at).toLocaleString() },
    {
      key: 'actions', header: '', className: 'text-right',
      render: (r) => (
        <div className="flex justify-end gap-1">
          {r.status === 'pending' && (
            <PermissionGate permission="van_loading:approve">
              <button className="btn-secondary !py-1" onClick={() => setToApprove(r)}><Check size={14} /> Approve</button>
            </PermissionGate>
          )}
          {r.status === 'approved' && !r.received_at && (
            <button className="btn-secondary !py-1" onClick={() => handleReceive(r.id)}><PackageCheck size={14} /> Mark received</button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Van-to-Van Transfers</h1>
          <p className="text-sm text-slate-500">Move stock directly between vans — including emergency and partial transfers — without routing through a warehouse.</p>
        </div>
        <PermissionGate permission="van_loading:create">
          <button className="btn-primary" onClick={() => setNewOpen(true)}><Plus size={16} /> New transfer</button>
        </PermissionGate>
      </div>

      {transfers.length === 0 && !loading ? (
        <div className="card flex flex-col items-center gap-2 p-10 text-center">
          <ArrowRightLeft className="text-slate-300" size={36} />
          <p className="font-medium text-slate-600 dark:text-slate-300">No van transfers yet</p>
        </div>
      ) : (
        <DataTable columns={columns} rows={transfers} rowKey={(r) => r.id} loading={loading} exportFilename="van-transfers" />
      )}

      <NewVanTransferModal open={newOpen} onClose={() => setNewOpen(false)} onCreated={reload} />
      <TransferItemsModal transfer={viewing} onClose={() => setViewing(null)} />

      <ConfirmDialog
        open={!!toApprove}
        title="Approve van transfer"
        message="Approving will move this stock between the two vans immediately. This cannot be undone."
        confirmLabel="Approve"
        danger={false}
        loading={busy}
        onConfirm={handleApprove}
        onCancel={() => setToApprove(null)}
      />
    </div>
  );
}
