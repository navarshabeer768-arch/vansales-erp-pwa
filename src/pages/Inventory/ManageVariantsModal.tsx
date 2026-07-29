import { useState } from 'react';
import { Plus, Ban, ImageIcon } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useProductVariants, useVariantStock, ProductVariant } from '@/hooks/useProductVariants';
import { useWarehouses } from '@/hooks/useWarehouses';
import { useToast } from '@/contexts/ToastContext';
import type { Product } from '@/types/database';

function VariantStockRow({ variant }: { variant: ProductVariant }) {
  const { warehouses } = useWarehouses();
  const { stock, adjustStock } = useVariantStock(variant.id);
  const { push } = useToast();
  const [warehouseId, setWarehouseId] = useState('');
  const [amount, setAmount] = useState(0);

  const handleAdjust = async (sign: 1 | -1) => {
    if (!warehouseId || amount <= 0) { push('error', 'Select a warehouse and an amount.'); return; }
    const { error } = await adjustStock(warehouseId, sign * amount);
    push(error ? 'error' : 'success', error ?? 'Variant stock updated.');
  };

  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
      <div className="mb-2 flex flex-wrap gap-3 text-sm">
        {stock.length === 0 ? (
          <span className="text-slate-400">No stock recorded for this variant yet.</span>
        ) : (
          stock.map((s) => (
            <span key={s.id} className="badge-slate">{s.location_name}: {s.quantity}</span>
          ))
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select className="input !w-40 !py-1.5" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
          <option value="">Warehouse…</option>
          {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <input type="number" min={0} step="0.001" className="input !w-24 !py-1.5" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
        <button className="btn-secondary !py-1.5" onClick={() => handleAdjust(1)}>+ Add</button>
        <button className="btn-secondary !py-1.5" onClick={() => handleAdjust(-1)}>- Remove</button>
      </div>
    </div>
  );
}

export function ManageVariantsModal({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const { variants, reload, createVariant, deactivateVariant } = useProductVariants(product?.id ?? null);
  const { push } = useToast();

  const [variantName, setVariantName] = useState('');
  const [skuSuffix, setSkuSuffix] = useState('');
  const [priceDelta, setPriceDelta] = useState(0);
  const [barcode, setBarcode] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const resetForm = () => { setVariantName(''); setSkuSuffix(''); setPriceDelta(0); setBarcode(''); setImageUrl(''); };

  const submit = async () => {
    if (!variantName.trim()) { push('error', 'Enter a variant name (e.g. "Red / Large").'); return; }
    setSubmitting(true);
    const { error } = await createVariant({
      variantName: variantName.trim(), skuSuffix: skuSuffix.trim() || undefined,
      priceDelta, barcode: barcode.trim() || undefined, imageUrl: imageUrl.trim() || undefined,
    });
    setSubmitting(false);
    if (error) { push('error', error); return; }
    push('success', 'Variant added.');
    resetForm();
  };

  const handleDeactivate = async (variantId: string) => {
    const { error } = await deactivateVariant(variantId);
    push(error ? 'error' : 'success', error ?? 'Variant deactivated.');
  };

  return (
    <Modal open={!!product} onClose={onClose} title={product ? `Variants — ${product.name}` : ''} size="lg">
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
          <div className="col-span-2">
            <label className="label">Variant name *</label>
            <input className="input" value={variantName} onChange={(e) => setVariantName(e.target.value)} placeholder="e.g. Red / Large, 500ml, 24-pack" />
          </div>
          <div>
            <label className="label">SKU suffix</label>
            <input className="input" value={skuSuffix} onChange={(e) => setSkuSuffix(e.target.value)} placeholder="-RED-L" />
          </div>
          <div>
            <label className="label">Price adjustment (+/-)</label>
            <input type="number" step="0.01" className="input" value={priceDelta} onChange={(e) => setPriceDelta(Number(e.target.value))} />
          </div>
          <div>
            <label className="label">Barcode</label>
            <input className="input" value={barcode} onChange={(e) => setBarcode(e.target.value)} />
          </div>
          <div>
            <label className="label">Image URL</label>
            <input className="input" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" />
          </div>
          <div className="col-span-2 flex justify-end">
            <button className="btn-primary" onClick={submit} disabled={submitting}>
              <Plus size={16} /> {submitting ? 'Adding…' : 'Add variant'}
            </button>
          </div>
        </div>

        {variants.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">No variants yet — add one above.</p>
        ) : (
          <div className="space-y-3">
            {variants.map((v) => (
              <div key={v.id} className="rounded-lg border border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-3">
                    {v.image_url ? (
                      <img src={v.image_url} alt="" className="h-10 w-10 rounded object-cover" />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded bg-slate-100 text-slate-400 dark:bg-slate-800">
                        <ImageIcon size={16} />
                      </div>
                    )}
                    <div>
                      <p className="font-medium">{v.variant_name}</p>
                      <p className="text-xs text-slate-500">
                        {v.sku_suffix && `SKU: ${product?.sku}${v.sku_suffix} · `}
                        Price {v.price_delta >= 0 ? '+' : ''}{v.price_delta.toFixed(2)}
                        {v.barcode && ` · ${v.barcode}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={v.is_active ? 'badge-green' : 'badge-slate'}>{v.is_active ? 'Active' : 'Inactive'}</span>
                    <button className="btn-ghost !px-2 !py-1" onClick={() => setExpandedId(expandedId === v.id ? null : v.id)}>
                      Stock
                    </button>
                    {v.is_active && (
                      <button className="btn-ghost !px-2 !py-1 text-red-600" onClick={() => handleDeactivate(v.id)}><Ban size={16} /></button>
                    )}
                  </div>
                </div>
                {expandedId === v.id && (
                  <div className="border-t border-slate-100 p-3 dark:border-slate-800">
                    <VariantStockRow variant={v} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
