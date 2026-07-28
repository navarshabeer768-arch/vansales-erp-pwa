import { useState, useEffect } from 'react';
import { Plus, Trash2, PackageCheck } from 'lucide-react';
import { useGoodsReceipts, ReceiveItemDraft } from '@/hooks/useGoodsReceipts';
import { usePurchaseOrders, fetchPoItems } from '@/hooks/usePurchaseOrders';
import { useSuppliers } from '@/hooks/useCatalog';
import { useWarehouses } from '@/hooks/useWarehouses';
import { useProducts } from '@/hooks/useProducts';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';

function NewReceiptModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { receiveGoods } = useGoodsReceipts();
  const { orders } = usePurchaseOrders();
  const { rows: suppliers } = useSuppliers();
  const { warehouses } = useWarehouses();
  const { products } = useProducts();
  const { push } = useToast();

  const [poId, setPoId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [items, setItems] = useState<ReceiveItemDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const openPoOrders = orders.filter((o) => o.status === 'sent' || o.status === 'partially_received');

  const reset = () => {
    setPoId(''); setSupplierId(''); setWarehouseId(''); setInvoiceNo(''); setItems([]);
  };

  useEffect(() => {
    if (!poId) return;
    const po = orders.find((o) => o.id === poId);
    if (!po) return;
    setSupplierId(po.supplier_id);
    setWarehouseId(po.warehouse_id);
    fetchPoItems(poId).then((poItems) => {
      setItems(
        poItems
          .filter((it) => it.quantity - it.received_quantity > 0)
          .map((it) => ({
            product_id: it.product_id, batch_id: null,
            quantity: it.quantity - it.received_quantity, unit_cost: it.unit_cost,
          }))
      );
    });
  }, [poId, orders]);

  const addProduct = (productId: string) => {
    const p = products.find((x) => x.id === productId);
    if (!p || items.some((it) => it.product_id === productId)) return;
    setItems((prev) => [...prev, { product_id: p.id, batch_id: null, quantity: 1, unit_cost: p.cost_price }]);
  };
  const updateItem = (idx: number, patch: Partial<ReceiveItemDraft>) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const submit = async () => {
    if (!supplierId || !warehouseId) { push('error', 'Select a supplier and warehouse.'); return; }
    setSubmitting(true);
    const { error } = await receiveGoods({ warehouseId, supplierId, poId: poId || null, supplierInvoiceNo: invoiceNo, items });
    setSubmitting(false);
    if (error) { push('error', error); return; }
    push('success', 'Stock received into the warehouse.');
    reset();
    onCreated();
    onClose();
  };

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title="New goods receipt" size="lg">
      <div className="space-y-4">
        <div>
          <label className="label">Against purchase order (optional)</label>
          <select className="input" value={poId} onChange={(e) => setPoId(e.target.value)}>
            <option value="">— Standalone receipt, no PO —</option>
            {openPoOrders.map((o) => <option key={o.id} value={o.id}>{o.po_no} — {o.supplier?.name}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Supplier *</label>
            <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} disabled={!!poId}>
              <option value="">Select a supplier…</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Warehouse *</label>
            <select className="input" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} disabled={!!poId}>
              <option value="">Select a warehouse…</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="label">Supplier invoice #</label>
          <input className="input" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
        </div>

        {!poId && (
          <div>
            <label className="label">Add product</label>
            <select className="input" value="" onChange={(e) => e.target.value && addProduct(e.target.value)}>
              <option value="">Select a product…</option>
              {products.filter((p) => p.is_active).map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
            </select>
          </div>
        )}

        {items.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="table-base">
              <thead><tr><th>Product</th><th>Qty</th><th>Unit cost</th><th>Batch #</th><th>Expiry</th><th></th></tr></thead>
              <tbody>
                {items.map((it, idx) => {
                  const p = products.find((x) => x.id === it.product_id);
                  return (
                    <tr key={idx}>
                      <td>{p?.name}</td>
                      <td><input type="number" min={0.001} step="0.001" className="input !w-24 !py-1.5" value={it.quantity} onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })} /></td>
                      <td><input type="number" min={0} step="0.01" className="input !w-24 !py-1.5" value={it.unit_cost} onChange={(e) => updateItem(idx, { unit_cost: Number(e.target.value) })} /></td>
                      <td><input className="input !w-28 !py-1.5" value={it.batch_no ?? ''} placeholder={p?.track_batches ? 'Required' : 'Optional'} onChange={(e) => updateItem(idx, { batch_no: e.target.value })} /></td>
                      <td><input type="date" className="input !w-36 !py-1.5" value={it.expiry_date ?? ''} onChange={(e) => updateItem(idx, { expiry_date: e.target.value })} /></td>
                      <td>{!poId && <button onClick={() => removeItem(idx)} className="text-slate-400 hover:text-red-600"><Trash2 size={16} /></button>}</td>
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
            {submitting ? 'Receiving…' : 'Receive stock'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function GoodsReceiptsPage() {
  const { receipts, loading, reload } = useGoodsReceipts();
  const [newOpen, setNewOpen] = useState(false);

  const columns: Column<typeof receipts[number]>[] = [
    { key: 'grn_no', header: 'GRN #', render: (r) => <span className="font-medium">{r.grn_no}</span> },
    { key: 'supplier', header: 'Supplier', render: (r) => r.supplier?.name ?? '—' },
    { key: 'warehouse', header: 'Warehouse', render: (r) => r.warehouse?.name ?? '—' },
    { key: 'invoice', header: 'Supplier invoice', render: (r) => r.supplier_invoice_no ?? '—' },
    { key: 'created_at', header: 'Received', render: (r) => new Date(r.created_at).toLocaleString() },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Goods Receipts</h1>
          <p className="text-sm text-slate-500">Receiving stock updates the warehouse immediately — no separate approval step.</p>
        </div>
        <PermissionGate permission="purchases:create">
          <button className="btn-primary" onClick={() => setNewOpen(true)}><Plus size={16} /> New receipt</button>
        </PermissionGate>
      </div>

      {receipts.length === 0 && !loading ? (
        <div className="card flex flex-col items-center gap-2 p-10 text-center">
          <PackageCheck className="text-slate-300" size={36} />
          <p className="font-medium text-slate-600 dark:text-slate-300">No goods received yet</p>
        </div>
      ) : (
        <DataTable columns={columns} rows={receipts} rowKey={(r) => r.id} loading={loading} />
      )}

      <NewReceiptModal open={newOpen} onClose={() => setNewOpen(false)} onCreated={reload} />
    </div>
  );
}
