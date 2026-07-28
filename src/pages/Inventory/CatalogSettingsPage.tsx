import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useCategories, useBrands, useUnits, useSuppliers } from '@/hooks/useCatalog';
import { useToast } from '@/contexts/ToastContext';
import { PermissionGate } from '@/components/common/PermissionGate';
import clsx from 'clsx';

type TabKey = 'categories' | 'brands' | 'units' | 'suppliers';

function QuickAddRow({ onAdd, fields }: { onAdd: (values: Record<string, string>) => Promise<void>; fields: { key: string; placeholder: string; }[] }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (fields.some((f) => !values[f.key]?.trim())) return;
    setBusy(true);
    await onAdd(values);
    setBusy(false);
    setValues({});
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap gap-2 border-b border-slate-200 p-3 dark:border-slate-800">
      {fields.map((f) => (
        <input
          key={f.key} className="input max-w-[220px]" placeholder={f.placeholder}
          value={values[f.key] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
        />
      ))}
      <button type="submit" className="btn-primary" disabled={busy}><Plus size={16} /> Add</button>
    </form>
  );
}

export function CatalogSettingsPage() {
  const [tab, setTab] = useState<TabKey>('categories');
  const { push } = useToast();

  const categories = useCategories();
  const brands = useBrands();
  const units = useUnits();
  const suppliers = useSuppliers();

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'categories', label: 'Categories' },
    { key: 'brands', label: 'Brands' },
    { key: 'units', label: 'Units' },
    { key: 'suppliers', label: 'Suppliers' },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Catalog settings</h1>
        <p className="text-sm text-slate-500">Reference data used across products: categories, brands, units, suppliers.</p>
      </div>

      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={clsx(
              'border-b-2 px-4 py-2 text-sm font-medium',
              tab === t.key ? 'border-brand-700 text-brand-700 dark:text-brand-400' : 'border-transparent text-slate-500 hover:text-slate-700'
            )}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'categories' && (
        <div className="card overflow-hidden">
          <PermissionGate permission="inventory:create">
            <QuickAddRow
              fields={[{ key: 'name', placeholder: 'Category name' }]}
              onAdd={async (v) => {
                const { error } = await categories.create({ name: v.name, is_active: true, parent_id: null } as any);
                push(error ? 'error' : 'success', error ?? 'Category added.');
              }}
            />
          </PermissionGate>
          <List items={categories.rows} onDelete={async (id) => {
            const { error } = await categories.remove(id);
            push(error ? 'error' : 'success', error ?? 'Category removed.');
          }} />
        </div>
      )}

      {tab === 'brands' && (
        <div className="card overflow-hidden">
          <PermissionGate permission="inventory:create">
            <QuickAddRow
              fields={[{ key: 'name', placeholder: 'Brand name' }]}
              onAdd={async (v) => {
                const { error } = await brands.create({ name: v.name, is_active: true } as any);
                push(error ? 'error' : 'success', error ?? 'Brand added.');
              }}
            />
          </PermissionGate>
          <List items={brands.rows} onDelete={async (id) => {
            const { error } = await brands.remove(id);
            push(error ? 'error' : 'success', error ?? 'Brand removed.');
          }} />
        </div>
      )}

      {tab === 'units' && (
        <div className="card overflow-hidden">
          <PermissionGate permission="inventory:create">
            <QuickAddRow
              fields={[{ key: 'name', placeholder: 'Unit name (e.g. Carton)' }, { key: 'symbol', placeholder: 'Symbol (e.g. CTN)' }]}
              onAdd={async (v) => {
                const { error } = await units.create({ name: v.name, symbol: v.symbol } as any);
                push(error ? 'error' : 'success', error ?? 'Unit added.');
              }}
            />
          </PermissionGate>
          <List items={units.rows} labelKey="name" extra={(u: any) => u.symbol} onDelete={async (id) => {
            const { error } = await units.remove(id);
            push(error ? 'error' : 'success', error ?? 'Unit removed.');
          }} />
        </div>
      )}

      {tab === 'suppliers' && (
        <div className="card overflow-hidden">
          <PermissionGate permission="inventory:create">
            <QuickAddRow
              fields={[{ key: 'name', placeholder: 'Supplier name' }, { key: 'phone', placeholder: 'Phone' }]}
              onAdd={async (v) => {
                const { error } = await suppliers.create({ name: v.name, phone: v.phone, is_active: true, payment_terms_days: 0 } as any);
                push(error ? 'error' : 'success', error ?? 'Supplier added.');
              }}
            />
          </PermissionGate>
          <List items={suppliers.rows} extra={(s: any) => s.phone} onDelete={async (id) => {
            const { error } = await suppliers.remove(id);
            push(error ? 'error' : 'success', error ?? 'Supplier removed.');
          }} />
        </div>
      )}
    </div>
  );
}

function List({ items, onDelete, labelKey = 'name', extra }: {
  items: any[]; onDelete: (id: string) => Promise<void>; labelKey?: string; extra?: (item: any) => string | undefined;
}) {
  if (items.length === 0) {
    return <p className="p-6 text-center text-sm text-slate-400">No records yet — add one above.</p>;
  }
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {items.map((item) => (
        <li key={item.id} className="flex items-center justify-between px-4 py-2.5">
          <div>
            <span className="text-sm font-medium">{item[labelKey]}</span>
            {extra?.(item) && <span className="ml-2 text-xs text-slate-500">{extra(item)}</span>}
          </div>
          <PermissionGate permission="inventory:delete">
            <button className="text-slate-400 hover:text-red-600" onClick={() => onDelete(item.id)} aria-label="Remove">
              <Trash2 size={16} />
            </button>
          </PermissionGate>
        </li>
      ))}
    </ul>
  );
}
