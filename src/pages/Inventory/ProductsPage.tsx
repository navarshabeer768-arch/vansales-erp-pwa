import { useState } from 'react';
import { Plus, Pencil, Ban, PackageX } from 'lucide-react';
import { useProducts } from '@/hooks/useProducts';
import type { Product } from '@/types/database';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';
import { ProductForm } from './ProductForm';
import type { ProductInput } from '@/hooks/useProducts';

export function ProductsPage() {
  const { products, loading, createProduct, updateProduct, deactivateProduct } = useProducts();
  const { push } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [toDeactivate, setToDeactivate] = useState<Product | null>(null);
  const [busy, setBusy] = useState(false);

  const openCreate = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (p: Product) => { setEditing(p); setFormOpen(true); };

  const handleSubmit = async (values: ProductInput) => {
    const result = editing ? await updateProduct(editing.id, values) : await createProduct(values);
    if (!result.error) {
      push('success', editing ? 'Product updated.' : 'Product created.');
      setFormOpen(false);
    }
    return result;
  };

  const handleDeactivate = async () => {
    if (!toDeactivate) return;
    setBusy(true);
    const { error } = await deactivateProduct(toDeactivate.id);
    setBusy(false);
    setToDeactivate(null);
    push(error ? 'error' : 'success', error ?? 'Product deactivated.');
  };

  const columns: Column<Product>[] = [
    {
      key: 'name', header: 'Product', sortValue: (r) => r.name,
      render: (r) => (
        <div>
          <p className="font-medium text-slate-800 dark:text-slate-100">{r.name}</p>
          <p className="text-xs text-slate-500">{r.sku}{r.barcode ? ` · ${r.barcode}` : ''}</p>
        </div>
      ),
    },
    { key: 'category', header: 'Category', render: (r) => r.category?.name ?? '—' },
    { key: 'brand', header: 'Brand', render: (r) => r.brand?.name ?? '—' },
    {
      key: 'selling_price', header: 'Selling price', sortValue: (r) => r.selling_price,
      render: (r) => `${r.selling_price.toFixed(2)} ${r.base_unit ? `/ ${r.base_unit.symbol}` : ''}`,
    },
    {
      key: 'min_stock', header: 'Min. stock', sortValue: (r) => r.min_stock,
      render: (r) => r.min_stock,
    },
    {
      key: 'status', header: 'Status',
      render: (r) => (
        <span className={r.is_active ? 'badge-green' : 'badge-slate'}>{r.is_active ? 'Active' : 'Inactive'}</span>
      ),
    },
    {
      key: 'actions', header: '', className: 'text-right',
      render: (r) => (
        <div className="flex justify-end gap-1">
          <PermissionGate permission="inventory:edit">
            <button className="btn-ghost !px-2 !py-1" onClick={() => openEdit(r)} aria-label={`Edit ${r.name}`}>
              <Pencil size={16} />
            </button>
          </PermissionGate>
          <PermissionGate permission="inventory:delete">
            {r.is_active && (
              <button
                className="btn-ghost !px-2 !py-1 text-red-600"
                onClick={() => setToDeactivate(r)}
                aria-label={`Deactivate ${r.name}`}
              >
                <Ban size={16} />
              </button>
            )}
          </PermissionGate>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Products</h1>
          <p className="text-sm text-slate-500">Catalog, pricing, and stock control settings.</p>
        </div>
        <PermissionGate permission="inventory:create">
          <button className="btn-primary" onClick={openCreate}>
            <Plus size={16} /> New product
          </button>
        </PermissionGate>
      </div>

      {products.length === 0 && !loading ? (
        <div className="card flex flex-col items-center gap-3 p-12 text-center">
          <PackageX className="text-slate-300" size={40} />
          <p className="font-medium text-slate-600 dark:text-slate-300">No products yet</p>
          <p className="max-w-sm text-sm text-slate-500">
            Add your first product to start tracking stock, pricing, and sales.
          </p>
          <PermissionGate permission="inventory:create">
            <button className="btn-primary" onClick={openCreate}><Plus size={16} /> New product</button>
          </PermissionGate>
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={products}
          rowKey={(r) => r.id}
          loading={loading}
          searchPlaceholder="Search by name, SKU, or barcode…"
          searchFn={(r, q) =>
            r.name.toLowerCase().includes(q) || r.sku.toLowerCase().includes(q) || (r.barcode ?? '').toLowerCase().includes(q)
          }
          exportFilename="products"
        />
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'Edit product' : 'New product'} size="lg">
        <ProductForm initial={editing} onSubmit={handleSubmit} onCancel={() => setFormOpen(false)} />
      </Modal>

      <ConfirmDialog
        open={!!toDeactivate}
        title="Deactivate product"
        message={`"${toDeactivate?.name}" will be hidden from sales and stock entry, but its history is kept. You can reactivate it later.`}
        confirmLabel="Deactivate"
        loading={busy}
        onConfirm={handleDeactivate}
        onCancel={() => setToDeactivate(null)}
      />
    </div>
  );
}
