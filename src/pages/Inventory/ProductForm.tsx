import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useEffect } from 'react';
import type { Product } from '@/types/database';
import type { ProductInput } from '@/hooks/useProducts';
import { useCategories, useBrands, useUnits, useSuppliers } from '@/hooks/useCatalog';

const schema = z.object({
  sku: z.string().min(1, 'SKU is required').max(50),
  name: z.string().min(1, 'Product name is required').max(200),
  description: z.string().max(1000).optional().or(z.literal('')),
  barcode: z.string().max(50).optional().or(z.literal('')),
  category_id: z.string().optional().or(z.literal('')),
  brand_id: z.string().optional().or(z.literal('')),
  supplier_id: z.string().optional().or(z.literal('')),
  base_unit_id: z.string().min(1, 'Base unit is required'),
  cost_price: z.coerce.number().min(0, 'Must be 0 or more'),
  selling_price: z.coerce.number().min(0, 'Must be 0 or more'),
  wholesale_price: z.coerce.number().min(0).optional(),
  retail_price: z.coerce.number().min(0).optional(),
  offer_price: z.coerce.number().min(0).optional(),
  tax_rate: z.coerce.number().min(0).max(100),
  min_stock: z.coerce.number().min(0),
  max_stock: z.coerce.number().min(0).optional(),
  track_batches: z.boolean(),
  track_expiry: z.boolean(),
  track_serials: z.boolean(),
  is_active: z.boolean(),
}).refine((v) => !v.max_stock || v.max_stock >= v.min_stock, {
  message: 'Maximum stock must be greater than or equal to minimum stock',
  path: ['max_stock'],
});

type FormValues = z.infer<typeof schema>;

interface ProductFormProps {
  initial?: Product | null;
  onSubmit: (values: ProductInput) => Promise<{ error: string | null }>;
  onCancel: () => void;
}

export function ProductForm({ initial, onSubmit, onCancel }: ProductFormProps) {
  const { rows: categories } = useCategories();
  const { rows: brands } = useBrands();
  const { rows: units } = useUnits();
  const { rows: suppliers } = useSuppliers();

  const {
    register, handleSubmit, formState: { errors, isSubmitting }, reset, setError, watch,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      sku: '', name: '', description: '', barcode: '', category_id: '', brand_id: '', supplier_id: '',
      base_unit_id: '', cost_price: 0, selling_price: 0, tax_rate: 0, min_stock: 0,
      track_batches: false, track_expiry: false, track_serials: false, is_active: true,
    },
  });

  useEffect(() => {
    if (initial) {
      reset({
        sku: initial.sku, name: initial.name, description: initial.description ?? '',
        barcode: initial.barcode ?? '', category_id: initial.category_id ?? '', brand_id: initial.brand_id ?? '',
        supplier_id: initial.supplier_id ?? '', base_unit_id: initial.base_unit_id,
        cost_price: initial.cost_price, selling_price: initial.selling_price,
        wholesale_price: initial.wholesale_price ?? undefined, retail_price: initial.retail_price ?? undefined,
        offer_price: initial.offer_price ?? undefined, tax_rate: initial.tax_rate,
        min_stock: initial.min_stock, max_stock: initial.max_stock ?? undefined,
        track_batches: initial.track_batches, track_expiry: initial.track_expiry,
        track_serials: initial.track_serials, is_active: initial.is_active,
      });
    }
  }, [initial, reset]);

  const trackExpiry = watch('track_expiry');

  const submit = async (values: FormValues) => {
    const payload: ProductInput = {
      ...values,
      description: values.description || null,
      barcode: values.barcode || null,
      category_id: values.category_id || null,
      brand_id: values.brand_id || null,
      supplier_id: values.supplier_id || null,
      wholesale_price: values.wholesale_price ?? null,
      retail_price: values.retail_price ?? null,
      offer_price: values.offer_price ?? null,
      max_stock: values.max_stock ?? null,
      qr_code: null,
      image_url: null,
      weight: null,
      volume: null,
    };
    const { error } = await onSubmit(payload);
    if (error) setError('sku', { message: error });
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="sku">SKU *</label>
          <input id="sku" className="input" {...register('sku')} />
          {errors.sku && <p className="error-text">{errors.sku.message}</p>}
        </div>
        <div>
          <label className="label" htmlFor="barcode">Barcode</label>
          <input id="barcode" className="input" {...register('barcode')} placeholder="Scan or type" />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="name">Product name *</label>
        <input id="name" className="input" {...register('name')} />
        {errors.name && <p className="error-text">{errors.name.message}</p>}
      </div>

      <div>
        <label className="label" htmlFor="description">Description</label>
        <textarea id="description" className="input" rows={2} {...register('description')} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="category_id">Category</label>
          <select id="category_id" className="input" {...register('category_id')}>
            <option value="">— None —</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="brand_id">Brand</label>
          <select id="brand_id" className="input" {...register('brand_id')}>
            <option value="">— None —</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="supplier_id">Supplier</label>
          <select id="supplier_id" className="input" {...register('supplier_id')}>
            <option value="">— None —</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="base_unit_id">Base unit *</label>
        <select id="base_unit_id" className="input" {...register('base_unit_id')}>
          <option value="">Select a unit</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.symbol})</option>)}
        </select>
        {errors.base_unit_id && <p className="error-text">{errors.base_unit_id.message}</p>}
        {units.length === 0 && (
          <p className="mt-1 text-xs text-amber-600">No units yet — add one from Inventory → Units first.</p>
        )}
      </div>

      <fieldset className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
        <legend className="px-1 text-sm font-medium text-slate-700 dark:text-slate-300">Pricing</legend>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="cost_price">Cost price *</label>
            <input id="cost_price" type="number" step="0.01" className="input" {...register('cost_price')} />
            {errors.cost_price && <p className="error-text">{errors.cost_price.message}</p>}
          </div>
          <div>
            <label className="label" htmlFor="selling_price">Selling price *</label>
            <input id="selling_price" type="number" step="0.01" className="input" {...register('selling_price')} />
            {errors.selling_price && <p className="error-text">{errors.selling_price.message}</p>}
          </div>
          <div>
            <label className="label" htmlFor="tax_rate">Tax rate (%)</label>
            <input id="tax_rate" type="number" step="0.01" className="input" {...register('tax_rate')} />
          </div>
          <div>
            <label className="label" htmlFor="wholesale_price">Wholesale price</label>
            <input id="wholesale_price" type="number" step="0.01" className="input" {...register('wholesale_price')} />
          </div>
          <div>
            <label className="label" htmlFor="retail_price">Retail price</label>
            <input id="retail_price" type="number" step="0.01" className="input" {...register('retail_price')} />
          </div>
          <div>
            <label className="label" htmlFor="offer_price">Offer price</label>
            <input id="offer_price" type="number" step="0.01" className="input" {...register('offer_price')} />
          </div>
        </div>
      </fieldset>

      <fieldset className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
        <legend className="px-1 text-sm font-medium text-slate-700 dark:text-slate-300">Stock control</legend>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="min_stock">Minimum stock</label>
            <input id="min_stock" type="number" step="0.001" className="input" {...register('min_stock')} />
          </div>
          <div>
            <label className="label" htmlFor="max_stock">Maximum stock</label>
            <input id="max_stock" type="number" step="0.001" className="input" {...register('max_stock')} />
            {errors.max_stock && <p className="error-text">{errors.max_stock.message}</p>}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register('track_batches')} /> Track batches
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register('track_expiry')} /> Track expiry
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register('track_serials')} /> Track serial numbers
          </label>
        </div>
        {trackExpiry && (
          <p className="mt-2 text-xs text-slate-500">
            Expiry dates are captured per batch when stock is received or loaded onto a van.
          </p>
        )}
      </fieldset>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" {...register('is_active')} /> Active (visible for sale)
      </label>

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={isSubmitting}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : initial ? 'Save changes' : 'Create product'}
        </button>
      </div>
    </form>
  );
}
