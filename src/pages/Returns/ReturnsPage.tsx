import { useState } from 'react';
import { Plus, Check, Trash2, Undo2 } from 'lucide-react';
import { useReturns, ReturnItemDraft, ReturnType, ReturnRow } from '@/hooks/useReturns';
import { useCustomers } from '@/hooks/useCustomers';
import { useSuppliers } from '@/hooks/useCatalog';
import { useWarehouses } from '@/hooks/useWarehouses';
import { useVans } from '@/hooks/useVans';
import { useProducts } from '@/hooks/useProducts';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';

function NewReturnModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { createReturn } = useReturns();
  const { customers } = useCustomers();
  const { rows: suppliers } = useSuppliers();
  const { warehouses } = useWarehouses();
  const { vans } = useVans();
  const { products } = useProducts();
  const { push } = useToast();

  const [returnType, setReturnType] = useState<ReturnType>('sales_return');
  const [customerId, setCustomerId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [locationType, setLocationType] = useState<'warehouse' | 'van'>('warehouse');
  const [locationId, setLocationId] = useState('');
  const [items, setItems] = useState<ReturnItemDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setReturnType('sales_return'); setCustomerId(''); setSupplierId('');
    setLocationType('warehouse'); setLocationId(''); setItems([]);
  };

  const addItem = (productId: string) => {
    const p = products.find((x) => x.id === productId);
    if (!p || items.some((it) => it.product_id === productId)) return;
    setItems((prev) => [...prev, { product_id: p.id, batch_id: null, quantity: 1, unit_price: p.selling_price }]);
  };
  const updateItem = (idx: number, patch: Partial<ReturnItemDraft>) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const submit = async () => {
    if (!locationId) { push('error', 'Select a location.'); return; }
    setSubmitting(true);
    const { error } = await createReturn({
      returnType, customerId: returnType === 'sales_return' ? customerId : null,
      supplierId: returnType === 'purchase_return' ? supplierId : null,
      locationType, locationId, items,
    });
    setSubmitting(false);
    if (error) { push('error', error); return; }
    push('success', 'Return created — pending approval.');
    reset();
    onCreated();
    onClose();
  };

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title="New return" size="lg">
      <div className="space-y-4">
        <div>
          <label className="label">Return type</label>
          <select className="input" value={returnType} onChange={(e) => { setReturnType(e.target.value as ReturnType); setLocationType('warehouse'); setItems([]); }}>
            <option value="sales_return">Sales return (customer → back to stock)</option>
            <option value="purchase_return">Purchase return (warehouse → back to supplier)</option>
          </select>
        </div>

        {returnType === 'sales_return' ? (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Customer (optional)</label>
              <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">— Not tied to a customer —</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.business_name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Restock to</label>
              <div className="flex gap-2">
                <select className="input !w-28" value={locationType} onChange={(e) => { setLocationType(e.target.value as 'warehouse' | 'van'); setLocationId(''); }}>
                  <option value="warehouse">Warehouse</option>
                  <option value="van">Van</option>
                </select>
                <select className="input" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                  <option value="">Select…</option>
                  {(locationType === 'warehouse' ? warehouses : vans).map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Supplier *</label>
              <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">Select a supplier…</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">From warehouse *</label>
              <select className="input" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                <option value="">Select…</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
          </div>
        )}

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
              <thead><tr><th>Product</th><th>Qty</th><th>Unit price</th><th>Line total</th><th></th></tr></thead>
              <tbody>
                {items.map((it, idx) => {
                  const p = products.find((x) => x.id === it.product_id);
                  return (
                    <tr key={idx}>
                      <td>{p?.name}</td>
                      <td><input type="number" min={0.001} step="0.001" className="input !w-24 !py-1.5" value={it.quantity} onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })} /></td>
                      <td><input type="number" min={0} step="0.01" className="input !w-28 !py-1.5" value={it.unit_price} onChange={(e) => updateItem(idx, { unit_price: Number(e.target.value) })} /></td>
                      <td className="font-medium">{(it.quantity * it.unit_price).toFixed(2)}</td>
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
            {submitting ? 'Submitting…' : 'Submit for approval'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function ReturnsPage() {
  const { returns, loading, reload, approveReturn } = useReturns();
  const { push } = useToast();
  const [newOpen, setNewOpen] = useState(false);
  const [toApprove, setToApprove] = useState<ReturnRow | null>(null);
  const [busy, setBusy] = useState(false);

  const handleApprove = async () => {
    if (!toApprove) return;
    setBusy(true);
    const { error } = await approveReturn(toApprove.id);
    setBusy(false);
    setToApprove(null);
    push(error ? 'error' : 'success', error ?? 'Return approved — stock and balances updated.');
  };

  const columns: Column<ReturnRow>[] = [
    { key: 'return_no', header: 'Return #', render: (r) => <span className="font-medium">{r.return_no}</span> },
    { key: 'type', header: 'Type', render: (r) => <span className="capitalize">{r.return_type.replace('_', ' ')}</span> },
    { key: 'party', header: 'Customer / Supplier', render: (r) => r.customer?.business_name ?? r.supplier?.name ?? '—' },
    { key: 'total', header: 'Amount', sortValue: (r) => r.total_amount, render: (r) => r.total_amount.toFixed(2) },
    { key: 'created_at', header: 'Created', render: (r) => new Date(r.created_at).toLocaleString() },
    { key: 'status', header: 'Status', render: (r) => (
      <span className={r.status === 'approved' ? 'badge-green' : r.status === 'rejected' ? 'badge-red' : 'badge-amber'}>{r.status}</span>
    ) },
    {
      key: 'actions', header: '', className: 'text-right',
      render: (r) => (
        <PermissionGate permission="returns:approve">
          {r.status === 'pending' && <button className="btn-secondary !py-1" onClick={() => setToApprove(r)}><Check size={14} /> Approve</button>}
        </PermissionGate>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Returns</h1>
          <p className="text-sm text-slate-500">Sales returns restock and credit the customer; purchase returns send stock back to a supplier.</p>
        </div>
        <PermissionGate permission="returns:create">
          <button className="btn-primary" onClick={() => setNewOpen(true)}><Plus size={16} /> New return</button>
        </PermissionGate>
      </div>

      {returns.length === 0 && !loading ? (
        <div className="card flex flex-col items-center gap-2 p-10 text-center">
          <Undo2 className="text-slate-300" size={36} />
          <p className="font-medium text-slate-600 dark:text-slate-300">No returns recorded yet</p>
        </div>
      ) : (
        <DataTable columns={columns} rows={returns} rowKey={(r) => r.id} loading={loading} emptyMessage="No returns yet." />
      )}

      <NewReturnModal open={newOpen} onClose={() => setNewOpen(false)} onCreated={reload} />

      <ConfirmDialog
        open={!!toApprove}
        title="Approve return"
        message={
          toApprove?.return_type === 'sales_return'
            ? 'Approving will add this stock back into the selected location and reduce the customer\'s outstanding balance immediately.'
            : 'Approving will remove this stock from the warehouse immediately, as it\'s going back to the supplier.'
        }
        confirmLabel="Approve"
        danger={false}
        loading={busy}
        onConfirm={handleApprove}
        onCancel={() => setToApprove(null)}
      />
    </div>
  );
}
