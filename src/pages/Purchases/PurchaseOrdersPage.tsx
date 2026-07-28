import { useState, useEffect } from 'react';
import { Plus, Trash2, Eye } from 'lucide-react';
import { usePurchaseOrders, fetchPoItems, PoItemDraft, PoItem, PurchaseOrder } from '@/hooks/usePurchaseOrders';
import { useSuppliers } from '@/hooks/useCatalog';
import { useWarehouses } from '@/hooks/useWarehouses';
import { useProducts } from '@/hooks/useProducts';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';

function NewPoModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { createOrder } = usePurchaseOrders();
  const { rows: suppliers } = useSuppliers();
  const { warehouses } = useWarehouses();
  const { products } = useProducts();
  const { push } = useToast();

  const [supplierId, setSupplierId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [items, setItems] = useState<PoItemDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => { setSupplierId(''); setWarehouseId(''); setItems([]); };

  const addItem = (productId: string) => {
    const p = products.find((x) => x.id === productId);
    if (!p || items.some((it) => it.product_id === productId)) return;
    setItems((prev) => [...prev, { product_id: p.id, quantity: 1, unit_cost: p.cost_price }]);
  };
  const updateItem = (idx: number, patch: Partial<PoItemDraft>) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const submit = async () => {
    if (!supplierId || !warehouseId) { push('error', 'Select a supplier and a receiving warehouse.'); return; }
    setSubmitting(true);
    const { error } = await createOrder(supplierId, warehouseId, items);
    setSubmitting(false);
    if (error) { push('error', error); return; }
    push('success', 'Purchase order created.');
    reset();
    onCreated();
    onClose();
  };

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title="New purchase order" size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Supplier *</label>
            <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Select a supplier…</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Receiving warehouse *</label>
            <select className="input" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              <option value="">Select a warehouse…</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="label">Add product</label>
          <select className="input" value="" onChange={(e) => e.target.value && addItem(e.target.value)}>
            <option value="">Select a product…</option>
            {products.filter((p) => p.is_active).map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
          </select>
        </div>

        {items.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="table-base">
              <thead><tr><th>Product</th><th>Qty</th><th>Unit cost</th><th>Line total</th><th></th></tr></thead>
              <tbody>
                {items.map((it, idx) => {
                  const p = products.find((x) => x.id === it.product_id);
                  return (
                    <tr key={idx}>
                      <td>{p?.name}</td>
                      <td><input type="number" min={0.001} step="0.001" className="input !w-24 !py-1.5" value={it.quantity} onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })} /></td>
                      <td><input type="number" min={0} step="0.01" className="input !w-28 !py-1.5" value={it.unit_cost} onChange={(e) => updateItem(idx, { unit_cost: Number(e.target.value) })} /></td>
                      <td className="font-medium">{(it.quantity * it.unit_cost).toFixed(2)}</td>
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
            {submitting ? 'Creating…' : 'Create purchase order'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function PoItemsModal({ po, onClose }: { po: PurchaseOrder | null; onClose: () => void }) {
  const [items, setItems] = useState<PoItem[]>([]);
  useEffect(() => { if (po) fetchPoItems(po.id).then(setItems); }, [po]);

  return (
    <Modal open={!!po} onClose={onClose} title={po ? `Items — ${po.po_no}` : ''} size="lg">
      <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="table-base">
          <thead><tr><th>Product</th><th>Ordered</th><th>Received</th><th>Unit cost</th></tr></thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id}>
                <td>{it.product?.name}</td>
                <td>{it.quantity}</td>
                <td>{it.received_quantity}</td>
                <td>{it.unit_cost.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

export function PurchaseOrdersPage() {
  const { orders, loading, reload } = usePurchaseOrders();
  const [newOpen, setNewOpen] = useState(false);
  const [viewing, setViewing] = useState<PurchaseOrder | null>(null);

  const statusBadge = (s: PurchaseOrder['status']) => {
    if (s === 'received') return 'badge-green';
    if (s === 'partially_received') return 'badge-amber';
    if (s === 'cancelled') return 'badge-red';
    return 'badge-slate';
  };

  const columns: Column<PurchaseOrder>[] = [
    { key: 'po_no', header: 'PO #', render: (r) => <span className="font-medium">{r.po_no}</span> },
    { key: 'supplier', header: 'Supplier', render: (r) => r.supplier?.name ?? '—' },
    { key: 'warehouse', header: 'Warehouse', render: (r) => r.warehouse?.name ?? '—' },
    { key: 'total', header: 'Total', sortValue: (r) => r.total_amount, render: (r) => r.total_amount.toFixed(2) },
    { key: 'status', header: 'Status', render: (r) => <span className={statusBadge(r.status)}>{r.status.replace('_', ' ')}</span> },
    { key: 'created_at', header: 'Created', render: (r) => new Date(r.created_at).toLocaleString() },
    {
      key: 'actions', header: '', className: 'text-right',
      render: (r) => <button className="btn-ghost !px-2 !py-1" onClick={() => setViewing(r)}><Eye size={16} /></button>,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Purchase Orders</h1>
          <p className="text-sm text-slate-500">Raise orders with suppliers; receive them under Goods Receipts.</p>
        </div>
        <PermissionGate permission="purchases:create">
          <button className="btn-primary" onClick={() => setNewOpen(true)}><Plus size={16} /> New purchase order</button>
        </PermissionGate>
      </div>

      <DataTable columns={columns} rows={orders} rowKey={(r) => r.id} loading={loading} emptyMessage="No purchase orders yet." />

      <NewPoModal open={newOpen} onClose={() => setNewOpen(false)} onCreated={reload} />
      <PoItemsModal po={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}
