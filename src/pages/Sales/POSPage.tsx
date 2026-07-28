import { useMemo, useRef, useState } from 'react';
import { Search, Trash2, Plus, UserPlus, WifiOff } from 'lucide-react';
import { useVans } from '@/hooks/useVans';
import { useVanStock } from '@/hooks/useVanUnloadings';
import { useCustomers } from '@/hooks/useCustomers';
import { useCreateSale, CartItem, PaymentEntry, calculateCartTotals, useOfflineSync } from '@/hooks/useSales';
import { useToast } from '@/contexts/ToastContext';
import { Modal } from '@/components/ui/Modal';
import { supabase } from '@/lib/supabase';

const PAYMENT_METHODS: PaymentEntry['method'][] = ['cash', 'card', 'bank', 'upi', 'wallet', 'cheque'];

function QuickAddCustomerModal({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated: (id: string) => void;
}) {
  const { createCustomer } = useCustomers();
  const { push } = useToast();
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    const { error, data } = await createCustomer({ business_name: name.trim() });
    setSubmitting(false);
    if (error || !data) { push('error', error ?? 'Failed to add customer'); return; }
    push('success', 'Customer added.');
    onCreated(data.id);
    setName('');
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Quick-add customer" size="sm">
      <div className="space-y-4">
        <div>
          <label className="label">Business / customer name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose} disabled={submitting}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={submitting || !name.trim()}>
            {submitting ? 'Adding…' : 'Add customer'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function round2(n: number) { return Math.round(n * 100) / 100; }

export function POSPage() {
  const { vans } = useVans();
  const { customers, reload: reloadCustomers } = useCustomers();
  const { push } = useToast();
  const { submit, submitting } = useCreateSale();
  const { pendingCount, syncing } = useOfflineSync();

  const [vanId, setVanId] = useState('');
  const [customerId, setCustomerId] = useState<string>('');
  const [saleType, setSaleType] = useState<'cash' | 'credit' | 'pos'>('cash');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState('');
  const [payments, setPayments] = useState<PaymentEntry[]>([{ method: 'cash', amount: 0 }]);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const priceCache = useRef<Map<string, { price: number; tax: number }>>(new Map());

  const { stock: vanStock } = useVanStock(vanId || null);

  const matches = useMemo(() => {
    if (!search.trim() || !vanId) return [];
    const q = search.toLowerCase();
    return vanStock.filter((s) =>
      s.quantity > 0 && (
        (s.product?.name ?? '').toLowerCase().includes(q) ||
        (s.product?.sku ?? '').toLowerCase().includes(q)
      )
    ).slice(0, 8);
  }, [search, vanStock, vanId]);

  const totals = calculateCartTotals(cart);
  const paidTotal = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const balanceDue = round2(totals.total - paidTotal);

  const ensurePricing = async (productId: string) => {
    if (priceCache.current.has(productId)) return priceCache.current.get(productId)!;
    const { data } = await supabase.from('products').select('selling_price, tax_rate').eq('id', productId).single();
    const info = { price: data?.selling_price ?? 0, tax: data?.tax_rate ?? 0 };
    priceCache.current.set(productId, info);
    return info;
  };

  const handleAdd = async (stockId: string) => {
    const s = vanStock.find((x) => x.id === stockId);
    if (!s || !s.product) return;
    const info = await ensurePricing(s.product_id);

    setCart((prev) => {
      const existingIdx = prev.findIndex((c) => c.product_id === s.product_id && c.batch_id === s.batch_id);
      if (existingIdx >= 0) {
        const copy = [...prev];
        const next = Math.min(copy[existingIdx].quantity + 1, s.quantity);
        copy[existingIdx] = { ...copy[existingIdx], quantity: next };
        return copy;
      }
      return [...prev, {
        product_id: s.product_id, batch_id: s.batch_id, product_name: s.product!.name,
        unit_price: info.price, tax_rate: info.tax, quantity: 1, discount_pct: 0,
        is_free_item: false, available: s.quantity,
      }];
    });
    setSearch('');
    searchRef.current?.focus();
  };

  const updateCartItem = (idx: number, patch: Partial<CartItem>) =>
    setCart((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  const removeCartItem = (idx: number) => setCart((prev) => prev.filter((_, i) => i !== idx));

  const addPaymentRow = () => setPayments((prev) => [...prev, { method: 'cash', amount: 0 }]);
  const updatePayment = (idx: number, patch: Partial<PaymentEntry>) =>
    setPayments((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  const removePayment = (idx: number) => setPayments((prev) => prev.filter((_, i) => i !== idx));

  const resetSale = () => {
    setCart([]);
    setPayments([{ method: 'cash', amount: 0 }]);
    setCustomerId('');
  };

  const handleSubmit = async () => {
    if (!vanId) { push('error', 'Select a van to sell from.'); return; }
    if (cart.length === 0) { push('error', 'Add at least one product.'); return; }
    if (saleType !== 'credit' && paidTotal < totals.total) {
      push('error', `Payment (${paidTotal.toFixed(2)}) is short of the total (${totals.total.toFixed(2)}).`);
      return;
    }
    if (saleType === 'credit' && !customerId) {
      push('error', 'A credit sale requires a customer.');
      return;
    }

    const result = await submit({
      customerId: customerId || null,
      vanId,
      saleType,
      items: cart,
      payments: payments.filter((p) => p.amount > 0),
    });

    if (result.error) { push('error', result.error); return; }
    if (result.queued) {
      push('info', "No connection — sale saved on this device and will sync automatically when you're back online.");
    } else {
      push('success', 'Sale completed.');
    }
    resetSale();
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {pendingCount > 0 && (
        <div className="lg:col-span-3 card flex items-center gap-2 border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-900/20 dark:text-amber-300">
          <WifiOff size={16} />
          {syncing ? 'Syncing offline sales…' : `${pendingCount} sale${pendingCount === 1 ? '' : 's'} saved offline, waiting to sync.`}
        </div>
      )}

      <div className="space-y-4 lg:col-span-2">
        <div className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
          <div>
            <label className="label">Van</label>
            <select className="input" value={vanId} onChange={(e) => { setVanId(e.target.value); setCart([]); }}>
              <option value="">Select a van…</option>
              {vans.filter((v) => v.status === 'active').map((v) => <option key={v.id} value={v.id}>{v.name} ({v.code})</option>)}
            </select>
          </div>
          <div>
            <label className="label">Sale type</label>
            <select className="input" value={saleType} onChange={(e) => setSaleType(e.target.value as 'cash' | 'credit' | 'pos')}>
              <option value="cash">Cash</option>
              <option value="credit">Credit</option>
              <option value="pos">Card / POS</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label">Customer {saleType === 'credit' && <span className="text-red-500">*</span>}</label>
            <div className="flex gap-2">
              <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">— Walk-in / cash customer —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.business_name}{c.outstanding_balance > 0 ? ` (due ${c.outstanding_balance.toFixed(2)})` : ''}
                  </option>
                ))}
              </select>
              <button className="btn-secondary shrink-0" onClick={() => setQuickAddOpen(true)} type="button">
                <UserPlus size={16} />
              </button>
            </div>
          </div>
        </div>

        <div className="card p-4">
          <label className="label">Scan barcode or search product</label>
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchRef}
              className="input pl-9"
              placeholder={vanId ? 'Type product name, SKU, or scan barcode…' : 'Select a van first'}
              value={search}
              disabled={!vanId}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && matches.length > 0) handleAdd(matches[0].id);
              }}
            />
          </div>
          {matches.length > 0 && (
            <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
              {matches.map((s) => (
                <li key={s.id}>
                  <button
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                    onClick={() => handleAdd(s.id)}
                  >
                    <span>{s.product?.name} <span className="text-slate-400">({s.product?.sku})</span></span>
                    <span className="text-slate-500">On van: {s.quantity}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card overflow-hidden">
          <table className="table-base">
            <thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Disc %</th><th>Free</th><th>Line total</th><th></th></tr></thead>
            <tbody>
              {cart.length === 0 ? (
                <tr><td colSpan={7} className="py-10 text-center text-slate-400">Cart is empty — search or scan a product above.</td></tr>
              ) : cart.map((item, idx) => {
                const price = item.is_free_item ? 0 : item.unit_price;
                const gross = price * item.quantity;
                const disc = item.is_free_item ? 0 : round2(gross * item.discount_pct / 100);
                const tax = round2((gross - disc) * item.tax_rate / 100);
                const lineTotal = gross - disc + tax;
                return (
                  <tr key={idx}>
                    <td className="font-medium">{item.product_name}</td>
                    <td>
                      <input
                        type="number" min={1} max={item.available} step="0.001" className="input !w-20 !py-1.5"
                        value={item.quantity}
                        onChange={(e) => updateCartItem(idx, { quantity: Math.min(Number(e.target.value), item.available) })}
                      />
                      <p className="mt-0.5 text-xs text-slate-400">max {item.available}</p>
                    </td>
                    <td>{item.unit_price.toFixed(2)}</td>
                    <td>
                      <input
                        type="number" min={0} max={100} step="1" className="input !w-16 !py-1.5"
                        value={item.discount_pct} disabled={item.is_free_item}
                        onChange={(e) => updateCartItem(idx, { discount_pct: Number(e.target.value) })}
                      />
                    </td>
                    <td>
                      <input type="checkbox" checked={item.is_free_item} onChange={(e) => updateCartItem(idx, { is_free_item: e.target.checked })} />
                    </td>
                    <td className="font-semibold">{lineTotal.toFixed(2)}</td>
                    <td><button onClick={() => removeCartItem(idx)} className="text-slate-400 hover:text-red-600"><Trash2 size={16} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        <div className="card space-y-2 p-4">
          <div className="flex justify-between text-sm"><span className="text-slate-500">Subtotal</span><span>{totals.subtotal.toFixed(2)}</span></div>
          <div className="flex justify-between text-sm"><span className="text-slate-500">Discount</span><span>-{totals.discount.toFixed(2)}</span></div>
          <div className="flex justify-between text-sm"><span className="text-slate-500">Tax</span><span>{totals.tax.toFixed(2)}</span></div>
          <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold dark:border-slate-700">
            <span>Total</span><span>{totals.total.toFixed(2)}</span>
          </div>
        </div>

        <div className="card space-y-3 p-4">
          <div className="flex items-center justify-between">
            <span className="label !mb-0">Payments</span>
            {saleType !== 'credit' && (
              <button className="btn-ghost !px-2 !py-1 text-sm" onClick={addPaymentRow} type="button"><Plus size={14} /> Add</button>
            )}
          </div>
          {saleType === 'credit' && (
            <p className="text-sm text-slate-500">
              Credit sale — the remaining amount is added to the customer's outstanding balance.
              Add a partial payment below if they're paying something now.
            </p>
          )}
          {payments.map((p, idx) => (
            <div key={idx} className="flex gap-2">
              <select className="input !py-1.5" value={p.method} onChange={(e) => updatePayment(idx, { method: e.target.value as PaymentEntry['method'] })}>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <input type="number" min={0} step="0.01" className="input !py-1.5" value={p.amount}
                onChange={(e) => updatePayment(idx, { amount: Number(e.target.value) })} placeholder="Amount" />
              {payments.length > 1 && (
                <button onClick={() => removePayment(idx)} className="text-slate-400 hover:text-red-600"><Trash2 size={16} /></button>
              )}
            </div>
          ))}
          <div className="flex justify-between border-t border-slate-200 pt-2 text-sm dark:border-slate-700">
            <span className="text-slate-500">{balanceDue > 0 ? 'Balance due' : balanceDue < 0 ? 'Change' : 'Fully paid'}</span>
            <span className={balanceDue > 0 ? 'font-semibold text-red-600' : 'font-semibold text-emerald-600'}>
              {Math.abs(balanceDue).toFixed(2)}
            </span>
          </div>
        </div>

        <button className="btn-primary w-full !py-3 text-base" onClick={handleSubmit} disabled={submitting || cart.length === 0}>
          {submitting ? 'Processing…' : `Complete sale — ${totals.total.toFixed(2)}`}
        </button>
      </div>

      <QuickAddCustomerModal
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        onCreated={(id) => { setCustomerId(id); reloadCustomers(); }}
      />
    </div>
  );
}
