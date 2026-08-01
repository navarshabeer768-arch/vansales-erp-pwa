import { useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Trash2, ScanLine, Receipt, Save, Send, WifiOff, UserPlus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useProducts } from '@/hooks/useProducts';
import { useCustomers } from '@/hooks/useCustomers';
import { useVans } from '@/hooks/useVans';
import { useMyVanIds } from '@/hooks/useVanAssignments';
import { useSalesInvoiceTypes } from '@/hooks/useSalesInvoiceTypes';
import { useOrderCustomerContext } from '@/hooks/useOrderCustomerContext';
import { useCreateSalesInvoice, InvoiceCartItem } from '@/hooks/useCreateSalesInvoice';
import { useRecentAndFavouriteProducts } from '@/hooks/useRecentAndFavouriteProducts';
import { BarcodeScannerModal, isBarcodeScanningSupported } from '@/components/pos/BarcodeScannerModal';
import { useHidScanListener } from '@/hooks/useHidScanListener';
import { useToast } from '@/contexts/ToastContext';
import { PermissionGate } from '@/components/common/PermissionGate';

function round2(n: number) { return Math.round(n * 100) / 100; }

export function SalesInvoiceEntryPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { push } = useToast();
  const { products } = useProducts();
  const { customers } = useCustomers();
  const { vans } = useVans();
  const myVanIds = useMyVanIds();
  const accessibleVans = myVanIds === null ? vans : vans.filter((v) => myVanIds.has(v.id));
  const { invoiceTypes } = useSalesInvoiceTypes();
  const { recordView } = useRecentAndFavouriteProducts();
  const { submit, submitting } = useCreateSalesInvoice();

  const [vanId, setVanId] = useState('');
  const [customerId, setCustomerId] = useState(searchParams.get('customer_id') ?? '');
  const [isWalkIn, setIsWalkIn] = useState(false);
  const [walkInName, setWalkInName] = useState('');
  const [walkInPhone, setWalkInPhone] = useState('');
  const [invoiceTypeCode, setInvoiceTypeCode] = useState('van_sales_invoice');
  const [paymentType, setPaymentType] = useState('cash');
  const [cart, setCart] = useState<InvoiceCartItem[]>([]);
  const [search, setSearch] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [isOffline] = useState(!navigator.onLine);
  const searchRef = useRef<HTMLInputElement>(null);

  const dailyVisitPlanId = searchParams.get('plan_id') ?? undefined;
  const customerVisitId = searchParams.get('visit_id') ?? undefined;

  const { context: customerContext } = useOrderCustomerContext(!isWalkIn ? (customerId || undefined) : undefined);

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
      if (existing) return prev.map((c) => c === existing ? { ...c, quantity: c.quantity + 1 } : c);
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

  const updateCartItem = (index: number, patch: Partial<InvoiceCartItem>) => {
    setCart((prev) => prev.map((c, i) => i === index ? { ...c, ...patch } : c));
  };
  const removeCartItem = (index: number) => setCart((prev) => prev.filter((_, i) => i !== index));

  const previewTotal = round2(cart.reduce((sum, c) => sum + (c.requested_price ?? c.standard_price) * c.quantity, 0));

  const handleSave = async (submitAfter: boolean) => {
    if (!isWalkIn && !customerId) { push('error', 'Select a customer, or switch to Walk-In.'); return; }
    if (isWalkIn && !walkInName.trim()) { push('error', 'Enter the walk-in customer name.'); return; }
    if (cart.length === 0) { push('error', 'Add at least one item.'); return; }

    const { data, error } = await submit({
      invoiceTypeCode,
      items: cart,
      customerId: isWalkIn ? null : customerId,
      walkInName: isWalkIn ? walkInName : null,
      walkInPhone: isWalkIn ? walkInPhone : null,
      vanId: vanId || null,
      salesmanId: user?.id ?? null,
      routeId: customerContext?.route_id ?? null,
      dailyVisitPlanId: dailyVisitPlanId ?? null,
      customerVisitId: customerVisitId ?? null,
      paymentType,
      notes: notes || null,
      isDirectInvoice: !dailyVisitPlanId,
      directInvoiceSource: isWalkIn ? 'walk_in' : (dailyVisitPlanId ? undefined : 'office'),
      isOffline,
    });
    if (error) { push('error', error); return; }
    if (submitAfter && data) {
      const { error: subErr } = await supabase.rpc('change_sales_invoice_status', { p_invoice_id: data, p_new_status: 'submitted' });
      if (subErr) { push('error', `Draft saved but could not submit: ${subErr.message}`); navigate(`/sales/invoices/${data}`); return; }
    }
    push('success', submitAfter ? 'Invoice submitted.' : 'Invoice saved as draft.');
    if (data) navigate(`/sales/invoices/${data}`);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-lg font-bold text-slate-800 dark:text-slate-100">
          <Receipt size={20} /> New Sales Invoice
        </h1>
        {isOffline && <span className="flex items-center gap-1 text-xs text-red-500"><WifiOff size={14} /> Offline — will sync later</span>}
      </div>

      <div className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
        <div className="sm:col-span-2 flex items-center justify-between">
          <label className="label !mb-0">Customer</label>
          <PermissionGate permission="sales_invoices:create_walk_in">
            <button className="flex items-center gap-1 text-xs text-blue-600 hover:underline" onClick={() => setIsWalkIn((v) => !v)}>
              <UserPlus size={12} /> {isWalkIn ? 'Use registered customer' : 'Walk-in customer'}
            </button>
          </PermissionGate>
        </div>
        {isWalkIn ? (
          <>
            <div>
              <label className="label">Walk-In Name *</label>
              <input className="input" value={walkInName} onChange={(e) => setWalkInName(e.target.value)} />
            </div>
            <div>
              <label className="label">Walk-In Phone</label>
              <input className="input" value={walkInPhone} onChange={(e) => setWalkInPhone(e.target.value)} />
            </div>
          </>
        ) : (
          <div className="sm:col-span-2">
            <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Select customer…</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.customer_code} — {c.business_name}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="label">Invoice Type</label>
          <select className="input" value={invoiceTypeCode} onChange={(e) => setInvoiceTypeCode(e.target.value)}>
            {invoiceTypes.map((t) => <option key={t.id} value={t.code}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Payment Type</label>
          <select className="input" value={paymentType} onChange={(e) => setPaymentType(e.target.value)}>
            <option value="cash">Cash</option>
            <option value="credit">Credit</option>
            <option value="hybrid">Hybrid</option>
          </select>
        </div>
        <div>
          <label className="label">Van</label>
          <select className="input" value={vanId} onChange={(e) => setVanId(e.target.value)}>
            <option value="">—</option>
            {accessibleVans.map((v) => <option key={v.id} value={v.id}>{v.code} — {v.name}</option>)}
          </select>
        </div>

        {!isWalkIn && customerId && customerContext && (
          <div className="sm:col-span-2 rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-800">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div><p className="text-slate-500">Status</p><p className="font-medium capitalize">{customerContext.status}</p></div>
              <div><p className="text-slate-500">Credit Type</p><p className="font-medium capitalize">{customerContext.credit_type ?? '—'}</p></div>
              <div><p className="text-slate-500">Available Credit</p><p className="font-medium">{customerContext.available_credit ?? '—'}</p></div>
              <div><p className="text-slate-500">Outstanding</p><p className="font-medium">{customerContext.outstanding_balance ?? 0}</p></div>
            </div>
          </div>
        )}
      </div>

      <div className="card p-4">
        <label className="label">Search or scan product</label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input ref={searchRef} className="input pl-9" placeholder="Barcode, SKU, or name…" value={search} onChange={(e) => setSearch(e.target.value)} />
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
                <div><p className="font-medium">{item.name}</p><p className="text-xs text-slate-400">{item.sku}</p></div>
                <button className="text-red-500" onClick={() => removeCartItem(idx)}><Trash2 size={16} /></button>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                <div>
                  <label className="label">Qty</label>
                  <input type="number" min={0.001} step="0.001" className="input" value={item.quantity} onChange={(e) => updateCartItem(idx, { quantity: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="label">Price</label>
                  <input type="number" className="input" value={item.requested_price ?? item.standard_price} onChange={(e) => updateCartItem(idx, { requested_price: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="label">Discount %</label>
                  <input type="number" className="input" value={item.manual_discount_pct ?? ''} onChange={(e) => updateCartItem(idx, { manual_discount_pct: e.target.value ? Number(e.target.value) : null })} />
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
          <button className="btn-secondary" onClick={() => handleSave(false)} disabled={submitting}><Save size={16} /> Save Draft</button>
          <button className="btn-primary" onClick={() => handleSave(true)} disabled={submitting}><Send size={16} /> Submit</button>
        </div>
      </div>

      <BarcodeScannerModal open={scannerOpen} onClose={() => setScannerOpen(false)} onDetected={(v) => { setScannerOpen(false); handleScan(v); }} />
    </div>
  );
}
