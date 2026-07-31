import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { usePriceLists, useProductPriceRules, PriceList } from '@/hooks/usePriceLists';
import { useProducts } from '@/hooks/useProducts';
import { useWarehouses } from '@/hooks/useWarehouses';
import { Modal } from '@/components/ui/Modal';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';

function NewPriceListModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { create } = usePriceLists();
  const { warehouses } = useWarehouses();
  const { push } = useToast();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('QAR');
  const [priority, setPriority] = useState(0);
  const [branchId, setBranchId] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!code.trim() || !name.trim()) { push('error', 'Code and name are required.'); return; }
    setSubmitting(true);
    const { error } = await create({ code, name, currency, priority, branchId: branchId || undefined, effectiveDate: effectiveDate || undefined, expiryDate: expiryDate || undefined });
    setSubmitting(false);
    if (error) { push('error', error); return; }
    push('success', 'Price list created.');
    onCreated();
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="New price list" size="sm">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <input className="input" placeholder="Code *" value={code} onChange={(e) => setCode(e.target.value)} />
          <input className="input" placeholder="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)} />
        </div>
        <input className="input" placeholder="Name *" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <input type="number" className="input" placeholder="Priority" value={priority} onChange={(e) => setPriority(Number(e.target.value))} />
          <select className="input" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">— No branch —</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Effective date</label><input type="date" className="input" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} /></div>
          <div><label className="label">Expiry date</label><input type="date" className="input" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} /></div>
        </div>
        <button className="btn-primary w-full" onClick={submit} disabled={submitting}>{submitting ? 'Creating…' : 'Create price list'}</button>
      </div>
    </Modal>
  );
}

function PriceListItemsModal({ priceList, onClose }: { priceList: PriceList | null; onClose: () => void }) {
  const { rules, create, deactivate } = useProductPriceRules({ priceListId: priceList?.id });
  const { products } = useProducts();
  const { push } = useToast();
  const [productId, setProductId] = useState('');
  const [price, setPrice] = useState(0);
  const [minSellingPrice, setMinSellingPrice] = useState('');
  const [maxDiscountPct, setMaxDiscountPct] = useState('');

  const submit = async () => {
    if (!priceList || !productId || price <= 0) { push('error', 'Select a product and enter a price.'); return; }
    const { error } = await create({
      productId, scopeType: 'price_list', priceListId: priceList.id, price,
      minSellingPrice: minSellingPrice ? Number(minSellingPrice) : undefined,
      maxDiscountPct: maxDiscountPct ? Number(maxDiscountPct) : undefined,
    });
    push(error ? 'error' : 'success', error ?? 'Price rule added.');
    if (!error) { setProductId(''); setPrice(0); setMinSellingPrice(''); setMaxDiscountPct(''); }
  };

  return (
    <Modal open={!!priceList} onClose={onClose} title={priceList ? `Prices — ${priceList.name}` : ''} size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-2">
          <select className="input col-span-2" value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">Select a product…</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input type="number" className="input" placeholder="Price" value={price} onChange={(e) => setPrice(Number(e.target.value))} />
          <button className="btn-primary" onClick={submit}><Plus size={16} /> Add</button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input type="number" className="input" placeholder="Minimum selling price (optional)" value={minSellingPrice} onChange={(e) => setMinSellingPrice(e.target.value)} />
          <input type="number" className="input" placeholder="Maximum discount % (optional)" value={maxDiscountPct} onChange={(e) => setMaxDiscountPct(e.target.value)} />
        </div>
        <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="table-base">
            <thead><tr><th>Product</th><th>Price</th><th>Min. selling</th><th>Max. discount</th><th></th></tr></thead>
            <tbody>
              {rules.length === 0 ? <tr><td colSpan={5} className="py-6 text-center text-slate-400">No prices set yet.</td></tr> : rules.map((r) => (
                <tr key={r.id}>
                  <td>{r.product?.name}</td><td>{r.price.toFixed(2)}</td><td>{r.min_selling_price?.toFixed(2) ?? '—'}</td><td>{r.max_discount_pct ?? '—'}%</td>
                  <td><button onClick={() => deactivate(r.id)} className="text-slate-400 hover:text-red-600"><Trash2 size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}

export function PriceListsPage() {
  const { priceLists, loading, updateStatus, reload } = usePriceLists();
  const { push } = useToast();
  const [newOpen, setNewOpen] = useState(false);
  const [editing, setEditing] = useState<PriceList | null>(null);

  const handleStatusChange = async (id: string, status: PriceList['status']) => {
    const { error } = await updateStatus(id, status);
    push(error ? 'error' : 'success', error ?? 'Status updated.');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Price Lists</h1>
          <p className="text-sm text-slate-500">Unlimited price lists — Retail, Wholesale, Distributor, VIP, seasonal, promotional, or fully custom.</p>
        </div>
        <PermissionGate permission="customer_pricing:manage_price_lists">
          <button className="btn-primary" onClick={() => setNewOpen(true)}><Plus size={16} /> New price list</button>
        </PermissionGate>
      </div>

      {loading ? <p className="text-center text-slate-400">Loading…</p> : priceLists.length === 0 ? (
        <div className="card p-10 text-center text-sm text-slate-400">No price lists yet.</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="table-base">
            <thead><tr><th>Code</th><th>Name</th><th>Currency</th><th>Priority</th><th>Branch</th><th>Effective — Expiry</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {priceLists.map((pl) => (
                <tr key={pl.id} className="cursor-pointer" onClick={() => setEditing(pl)}>
                  <td className="font-medium">{pl.code}</td>
                  <td>{pl.name}</td>
                  <td>{pl.currency}</td>
                  <td>{pl.priority}</td>
                  <td>{pl.branch?.name ?? '—'}</td>
                  <td>{pl.effective_date ?? '—'} — {pl.expiry_date ?? '—'}</td>
                  <td><span className={pl.status === 'active' ? 'badge-green' : pl.status === 'expired' ? 'badge-red' : 'badge-slate'}>{pl.status}</span></td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <PermissionGate permission="customer_pricing:manage_price_lists">
                      <select className="input !w-auto !py-1" value={pl.status} onChange={(e) => handleStatusChange(pl.id, e.target.value as PriceList['status'])}>
                        <option value="active">Active</option><option value="inactive">Inactive</option><option value="expired">Expired</option>
                      </select>
                    </PermissionGate>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <NewPriceListModal open={newOpen} onClose={() => setNewOpen(false)} onCreated={reload} />
      <PriceListItemsModal priceList={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
