import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Trash2, ScanLine, ShoppingCart, Save, Send, WifiOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useProducts } from '@/hooks/useProducts';
import { useCustomers } from '@/hooks/useCustomers';
import { useVans } from '@/hooks/useVans';
import { useMyVanIds } from '@/hooks/useVanAssignments';
import { useVanStock } from '@/hooks/useVanUnloadings';
import { useSalesOrderTypes } from '@/hooks/useSalesOrderTypes';
import { useOrderCustomerContext } from '@/hooks/useOrderCustomerContext';
import { useCreateSalesOrder, OrderCartItem } from '@/hooks/useCreateSalesOrder';
import { useRecentAndFavouriteProducts } from '@/hooks/useRecentAndFavouriteProducts';
import { BarcodeScannerModal, isBarcodeScanningSupported } from '@/components/pos/BarcodeScannerModal';
import { useHidScanListener } from '@/hooks/useHidScanListener';
import { useToast } from '@/contexts/ToastContext';
import { PermissionGate } from '@/components/common/PermissionGate';

function round2(n: number) { return Math.round(n * 100) / 100; }

export function SalesOrderEntryPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { push } = useToast();
  const { products } = useProducts();
  const { customers } = useCustomers();
  const { vans } = useVans();
  const myVanIds = useMyVanIds();
  const accessibleVans = myVanIds === null ? vans : vans.filter((v) => myVanIds.has(v.id));
  const { orderTypes } = useSalesOrderTypes();
  const { recordView } = useRecentAndFavouriteProducts();
  const { submit, submitting } = useCreateSalesOrder();

  const [vanId, setVanId] = useState('');
  const [customerId, setCustomerId] = useState(searchParams.get('customer_id') ?? '');
  const [orderTypeCode, setOrderTypeCode] = useState('van_sales');
  const [cart, setCart] = useState<OrderCartItem[]>([]);
  const [search, setSearch] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [customerRef, setCustomerRef] = useState('');
  const [customerPo, setCustomerPo] = useState('');
  const [notes, setNotes] = useState('');
  const [isOffline] = useState(!navigator.onLine);
  const searchRef = useRef<HTMLInputElement>(null);

  const dailyVisitPlanId = searchParams.get('plan_id') ?? undefined;
  const customerVisitId = searchParams.get('visit_id') ?? undefined;
  const beatPlanId = searchParams.get('beat_plan_id') ?? undefined;
  const routeId = searchParams.get('route_id') ?? undefined;

  const { context: customerContext, loading: contextLoading } = useOrderCustomerContext(customerId || undefined);
  const { stock: vanStock } = useVanStock(vanId || null);

  const selectedOrderType = orderTypes.find((t) => t.code === orderTypeCode);

  // Customer selection auto-loads route/van when available, matching the
  // doc's "Automatically load ... Assigned Route / Assigned Van" requirement.
  useEffect(() => {
    if (customerContext?.van_id && !vanId) setVanId(customerContext.van_id);
  }, [customerContext]); // eslint-disable-line react-hooks/exhaustive-deps

  const results = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return products.filter((p) =>
      p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.barcode ?? '').includes(search)
    ).slice(0, 20);
  }, [search, products]);

  const addToCart = async (product: (typeof products)[number]) => {
    recordView(product.id);
    setCart((prev) => {
      const existing = prev.find((c) => c.product_id === product.id && !c.unit_id);
      if (existing) {
        return prev.map((c) => c === existing ? { ...c, quantity: c.quantity + 1 } : c);
      }
      return [...prev, {
        product_id: product.id, quantity: 1, name: product.name, sku: product.sku,
        standard_price: product.selling_price, unit_symbol: (product as any).base_unit?.symbol ?? '',
      }];
    });
    setSearch('');
    searchRef.current?.focus();
  };

  const handleScan = async (raw: string) => {
    const { data } = await supabase.from('products').select('*').or(`barcode.eq.${raw},sku.eq.${raw}`).maybeSingle();
    if (!data) { push('error', `No product found for "${raw}"`); return; }
    await addToCart(data as any);
    push('success', `Added ${(data as any).name}`);
  };

  useHidScanListener(handleScan, !scannerOpen);

  const updateCartItem = (index: number, patch: Partial<OrderCartItem>) => {
    setCart((prev) => prev.map((c, i) => i === index ? { ...c, ...patch } : c));
  };
  const removeCartItem = (index: number) => setCart((prev) => prev.filter((_, i) => i !== index));

  // Client-side preview total only — the server recomputes authoritatively
  // via the pricing engine in create_sales_order(); this is just so the
  // person entering the order isn't staring at a blank total while typing.
  const previewTotal = round2(cart.reduce((sum, c) => sum + (c.requested_price ?? c.standard_price) * c.quantity, 0));

  const handleSave = async (submitAfter: boolean) => {
    if (!customerId) { push('error', 'Select a customer first.'); return; }
    if (cart.length === 0) { push('error', 'Add at least one item.'); return; }

    const { data, error } = await submit({
      customerId, orderTypeCode, items: cart, vanId: vanId || null, salesmanId: user?.id ?? null,
      routeId: routeId ?? customerContext?.route_id ?? null, beatPlanId: beatPlanId ?? null,
      dailyVisitPlanId: dailyVisitPlanId ?? null, customerVisitId: customerVisitId ?? null,
      customerReference: customerRef || null, customerPo: customerPo || null, notes: notes || null,
      isDirectOrder: !dailyVisitPlanId, isOffline,
    });
    if (error) { push('error', error); return; }
    if (submitAfter && data) {
      const { error: subErr } = await supabase.rpc('change_sales_order_status', { p_order_id: data, p_new_status: 'submitted' });
      if (subErr) { push('error', `Order saved but could not submit: ${subErr.message}`); navigate(`/sales/orders/${data}`); return; }
    }
    push('success', submitAfter ? 'Order submitted.' : 'Order saved as draft.');
    if (data) navigate(`/sales/orders/${data}`);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-lg font-bold text-slate-800 dark:text-slate-100">
          <ShoppingCart size={20} /> New Sales Order
        </h1>
        {isOffline && <span className="flex items-center gap-1 text-xs text-red-500"><WifiOff size={14} /> Offline — will sync later</span>}
      </div>

      <div className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
        <div>
          <label className="label">Customer *</label>
          <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">Select customer…</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.customer_code} — {c.business_name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Order Type</label>
          <select className="input" value={orderTypeCode} onChange={(e) => setOrderTypeCode(e.target.value)}>
            {orderTypes.map((t) => <option key={t.id} value={t.code}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Van</label>
          <select className="input" value={vanId} onChange={(e) => setVanId(e.target.value)}>
            <option value="">—</option>
            {accessibleVans.map((v) => <option key={v.id} value={v.id}>{v.code} — {v.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Customer PO</label>
          <input className="input" value={customerPo} onChange={(e) => setCustomerPo(e.target.value)} />
        </div>

        {customerId && !contextLoading && customerContext && (
          <div className="sm:col-span-2 rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-800">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div><p className="text-slate-500">Status</p><p className="font-medium capitalize">{customerContext.status}</p></div>
              <div><p className="text-slate-500">Credit Type</p><p className="font-medium capitalize">{customerContext.credit_type ?? '—'}</p></div>
              <div><p className="text-slate-500">Available Credit</p><p className="font-medium">{customerContext.available_credit ?? '—'}</p></div>
              <div><p className="text-slate-500">Outstanding</p><p className="font-medium">{customerContext.outstanding_balance ?? 0}</p></div>
            </div>
            {customerContext.status !== 'active' && (
              <p className="mt-2 text-amber-600">This customer is {customerContext.status} — creating an order requires authorization.</p>
            )}
          </div>
        )}
      </div>

      <div className="card p-4">
        <label className="label">Search or scan product</label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchRef}
              className="input pl-9"
              placeholder="Barcode, SKU, or name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {isBarcodeScanningSupported() && (
            <button className="btn-secondary" onClick={() => setScannerOpen(true)}><ScanLine size={16} /></button>
          )}
        </div>
        {results.length > 0 && (
          <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
            {results.map((p) => (
              <button key={p.id} className="flex w-full items-center justify-between rounded-lg border border-slate-100 p-2 text-left text-sm hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800" onClick={() => addToCart(p)}>
                <span>{p.name} <span className="text-xs text-slate-400">({p.sku})</span></span>
                <span className="font-medium">{p.selling_price}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="card p-4">
        <h3 className="mb-2 font-semibold">Items ({cart.length})</h3>
        {cart.length === 0 && <p className="text-sm text-slate-500">No items yet — search or scan a product above.</p>}
        <div className="space-y-2">
          {cart.map((item, idx) => (
            <div key={idx} className="rounded-lg border border-slate-100 p-3 dark:border-slate-800">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium">{item.name}</p>
                  <p className="text-xs text-slate-400">{item.sku}</p>
                </div>
                <button className="text-red-500" onClick={() => removeCartItem(idx)}><Trash2 size={16} /></button>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                <div>
                  <label className="label">Qty</label>
                  <input type="number" min={0.001} step="0.001" className="input" value={item.quantity}
                    onChange={(e) => updateCartItem(idx, { quantity: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="label">Price</label>
                  <input type="number" className="input" value={item.requested_price ?? item.standard_price}
                    onChange={(e) => updateCartItem(idx, { requested_price: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="label">Discount %</label>
                  <input type="number" className="input" value={item.manual_discount_pct ?? ''}
                    onChange={(e) => updateCartItem(idx, { manual_discount_pct: e.target.value ? Number(e.target.value) : null })} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-4">
        <label className="label">Notes</label>
        <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="sticky bottom-0 card flex items-center justify-between p-4">
        <div>
          <p className="text-xs text-slate-500">Estimated total (server recalculates authoritatively)</p>
          <p className="text-xl font-bold">{previewTotal.toFixed(2)}</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => handleSave(false)} disabled={submitting}>
            <Save size={16} /> Save Draft
          </button>
          <PermissionGate permission="sales_orders:submit">
            <button className="btn-primary" onClick={() => handleSave(true)} disabled={submitting}>
              <Send size={16} /> Submit
            </button>
          </PermissionGate>
        </div>
      </div>

      <BarcodeScannerModal open={scannerOpen} onClose={() => setScannerOpen(false)} onDetected={(v) => { setScannerOpen(false); handleScan(v); }} />
    </div>
  );
}
