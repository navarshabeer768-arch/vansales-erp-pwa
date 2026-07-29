import { useState } from 'react';
import { Printer, Tag } from 'lucide-react';
import { useProducts } from '@/hooks/useProducts';
import { useWarehouses } from '@/hooks/useWarehouses';
import { useWarehouseStock } from '@/hooks/useWarehouseStock';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { printLabels, LabelSize, LabelSymbology, LabelItem } from '@/lib/labelPrinting';

export function LabelPrintingPage() {
  const { company } = useAuth();
  const { products } = useProducts();
  const { warehouses } = useWarehouses();
  const { push } = useToast();

  const [mode, setMode] = useState<'product' | 'batch'>('product');
  const [symbology, setSymbology] = useState<LabelSymbology>('barcode');
  const [size, setSize] = useState<LabelSize>('58mm');
  const [warehouseId, setWarehouseId] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [printing, setPrinting] = useState(false);

  const { stock } = useWarehouseStock(mode === 'batch' ? (warehouseId || null) : null);

  const setQty = (id: string, qty: number) => setQuantities((prev) => ({ ...prev, [id]: qty }));

  const handlePrintProducts = async () => {
    const selected = products.filter((p) => (quantities[p.id] ?? 0) > 0);
    if (selected.length === 0) { push('error', 'Set a quantity greater than 0 for at least one product.'); return; }
    const items: (LabelItem & { quantity: number })[] = selected.map((p) => ({
      title: p.name, code: p.barcode || p.sku, price: `${p.selling_price.toFixed(2)}`,
      storeId: company?.store_id, quantity: quantities[p.id],
    }));
    setPrinting(true);
    await printLabels(items, symbology, size);
    setPrinting(false);
  };

  const handlePrintBatches = async () => {
    const selectedStock = stock.filter((s) => (quantities[s.id] ?? 0) > 0 && s.batch);
    if (selectedStock.length === 0) { push('error', 'Select a warehouse with batches, then set a quantity for at least one.'); return; }
    const items: (LabelItem & { quantity: number })[] = selectedStock.map((s) => ({
      title: s.product?.name ?? '—', code: s.batch?.batch_no ?? s.product?.sku ?? '',
      batchNo: s.batch?.batch_no, expiryDate: s.batch?.expiry_date ?? undefined,
      storeId: company?.store_id, quantity: quantities[s.id],
    }));
    setPrinting(true);
    await printLabels(items, symbology, size);
    setPrinting(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-700 text-white">
          <Tag size={20} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Label Printing</h1>
          <p className="text-sm text-slate-500">Barcode or QR labels for products, or batch labels with expiry — printed via your browser's print dialog to any thermal or sheet label printer.</p>
        </div>
      </div>

      <div className="card flex flex-wrap items-end gap-4 p-4">
        <div>
          <label className="label">Mode</label>
          <select className="input" value={mode} onChange={(e) => { setMode(e.target.value as 'product' | 'batch'); setQuantities({}); }}>
            <option value="product">Product labels</option>
            <option value="batch">Batch labels (batch # + expiry)</option>
          </select>
        </div>
        <div>
          <label className="label">Symbol</label>
          <select className="input" value={symbology} onChange={(e) => setSymbology(e.target.value as LabelSymbology)}>
            <option value="barcode">Barcode (Code 39)</option>
            <option value="qr">QR code</option>
          </select>
        </div>
        <div>
          <label className="label">Label size</label>
          <select className="input" value={size} onChange={(e) => setSize(e.target.value as LabelSize)}>
            <option value="58mm">58mm thermal roll</option>
            <option value="80mm">80mm thermal roll</option>
            <option value="a4-sheet">A4 sheet (3-across)</option>
          </select>
        </div>
        {mode === 'batch' && (
          <div>
            <label className="label">Warehouse</label>
            <select className="input" value={warehouseId} onChange={(e) => { setWarehouseId(e.target.value); setQuantities({}); }}>
              <option value="">Select a warehouse…</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
        )}
        <button
          className="btn-primary ml-auto"
          onClick={mode === 'product' ? handlePrintProducts : handlePrintBatches}
          disabled={printing}
        >
          <Printer size={16} /> {printing ? 'Preparing…' : 'Print labels'}
        </button>
      </div>

      {mode === 'product' ? (
        <div className="card overflow-hidden">
          <table className="table-base">
            <thead><tr><th>Product</th><th>SKU / Barcode</th><th>Price</th><th>Qty to print</th></tr></thead>
            <tbody>
              {products.filter((p) => p.is_active).map((p) => (
                <tr key={p.id}>
                  <td className="font-medium">{p.name}</td>
                  <td>{p.barcode || p.sku}</td>
                  <td>{p.selling_price.toFixed(2)}</td>
                  <td>
                    <input type="number" min={0} className="input !w-20 !py-1.5" value={quantities[p.id] ?? 0}
                      onChange={(e) => setQty(p.id, Number(e.target.value))} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card overflow-hidden">
          {!warehouseId ? (
            <p className="p-6 text-center text-sm text-slate-400">Select a warehouse to see its batches.</p>
          ) : stock.filter((s) => s.batch).length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-400">No batch-tracked stock in this warehouse.</p>
          ) : (
            <table className="table-base">
              <thead><tr><th>Product</th><th>Batch #</th><th>Expiry</th><th>On hand</th><th>Qty to print</th></tr></thead>
              <tbody>
                {stock.filter((s) => s.batch).map((s) => (
                  <tr key={s.id}>
                    <td className="font-medium">{s.product?.name}</td>
                    <td>{s.batch?.batch_no}</td>
                    <td>{s.batch?.expiry_date ?? '—'}</td>
                    <td>{s.quantity}</td>
                    <td>
                      <input type="number" min={0} className="input !w-20 !py-1.5" value={quantities[s.id] ?? 0}
                        onChange={(e) => setQty(s.id, Number(e.target.value))} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
