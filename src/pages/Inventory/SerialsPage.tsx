import { useState } from 'react';
import { Plus, Search, Barcode as BarcodeIcon } from 'lucide-react';
import { useSerials, searchSerial, ProductSerial } from '@/hooks/useSerials';
import { useProducts } from '@/hooks/useProducts';
import { useAuth } from '@/contexts/AuthContext';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';

const STATUS_BADGE: Record<ProductSerial['status'], string> = {
  in_stock: 'badge-green', sold: 'badge-slate', damaged: 'badge-red', lost: 'badge-red', returned: 'badge-amber',
};

function NewSerialModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { products } = useProducts();
  const { createSerial } = useSerials(null);
  const { push } = useToast();

  const [productId, setProductId] = useState('');
  const [serialNo, setSerialNo] = useState('');
  const [warrantyMonths, setWarrantyMonths] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => { setProductId(''); setSerialNo(''); setWarrantyMonths(''); setNotes(''); };

  const submit = async () => {
    if (!productId || !serialNo.trim()) { push('error', 'Select a product and enter a serial number.'); return; }
    setSubmitting(true);
    const { error } = await createSerial({
      productId, serialNo: serialNo.trim(),
      warrantyMonths: warrantyMonths === '' ? undefined : Number(warrantyMonths),
      notes: notes.trim() || undefined,
    });
    setSubmitting(false);
    if (error) { push('error', error); return; }
    push('success', 'Serial number registered.');
    reset();
    onCreated();
    onClose();
  };

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title="Register serial number" size="sm">
      <div className="space-y-4">
        <div>
          <label className="label">Product *</label>
          <select className="input" value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">Select a product…</option>
            {products.filter((p) => p.track_serials).map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
          </select>
          {products.filter((p) => p.track_serials).length === 0 && (
            <p className="mt-1 text-xs text-amber-600">No products have "Track serial numbers" enabled yet — turn it on when editing a product.</p>
          )}
        </div>
        <div>
          <label className="label">Serial number *</label>
          <input className="input" value={serialNo} onChange={(e) => setSerialNo(e.target.value)} />
        </div>
        <div>
          <label className="label">Warranty (months)</label>
          <input type="number" min={0} className="input" value={warrantyMonths}
            onChange={(e) => setWarrantyMonths(e.target.value === '' ? '' : Number(e.target.value))} />
        </div>
        <div>
          <label className="label">Notes</label>
          <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={() => { reset(); onClose(); }} disabled={submitting}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={submitting}>
            {submitting ? 'Registering…' : 'Register'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function SerialsPage() {
  const { company } = useAuth();
  const { serials, loading, reload, markStatus } = useSerials(null);
  const { push } = useToast();
  const [newOpen, setNewOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResult, setSearchResult] = useState<ProductSerial | null | undefined>(undefined);

  const handleSearch = async () => {
    if (!company || !searchTerm.trim()) return;
    const result = await searchSerial(company.id, searchTerm.trim());
    setSearchResult(result);
  };

  const columns: Column<ProductSerial>[] = [
    { key: 'serial_no', header: 'Serial #', render: (r) => <span className="font-medium">{r.serial_no}</span> },
    { key: 'product', header: 'Product', render: (r) => r.product?.name ?? '—' },
    { key: 'status', header: 'Status', render: (r) => <span className={STATUS_BADGE[r.status]}>{r.status.replace('_', ' ')}</span> },
    { key: 'warranty', header: 'Warranty until', render: (r) => r.warranty_expiry ?? '—' },
    { key: 'customer', header: 'Sold to', render: (r) => r.customer?.business_name ?? '—' },
    { key: 'invoice', header: 'Invoice', render: (r) => r.sale?.invoice_no ?? '—' },
    {
      key: 'actions', header: '', className: 'text-right',
      render: (r) => (
        <PermissionGate permission="inventory:edit">
          {r.status === 'in_stock' && (
            <div className="flex justify-end gap-1">
              <button className="btn-ghost !px-2 !py-1 text-red-600" onClick={() => markStatus(r.id, 'damaged').then(({ error }) => push(error ? 'error' : 'success', error ?? 'Marked damaged.'))}>
                Damaged
              </button>
              <button className="btn-ghost !px-2 !py-1 text-red-600" onClick={() => markStatus(r.id, 'lost').then(({ error }) => push(error ? 'error' : 'success', error ?? 'Marked lost.'))}>
                Lost
              </button>
            </div>
          )}
        </PermissionGate>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Serial Numbers</h1>
          <p className="text-sm text-slate-500">Track individual units, warranty periods, and which customer/invoice they were sold on.</p>
        </div>
        <PermissionGate permission="inventory:create">
          <button className="btn-primary" onClick={() => setNewOpen(true)}><Plus size={16} /> Register serial</button>
        </PermissionGate>
      </div>

      <div className="card flex gap-2 p-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Look up an exact serial number…" value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} />
        </div>
        <button className="btn-secondary" onClick={handleSearch}>Search</button>
      </div>

      {searchResult !== undefined && (
        <div className="card p-4">
          {searchResult === null ? (
            <p className="text-sm text-slate-500">No serial found matching "{searchTerm}".</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div><p className="text-slate-500">Serial</p><p className="font-medium">{searchResult.serial_no}</p></div>
              <div><p className="text-slate-500">Product</p><p className="font-medium">{searchResult.product?.name}</p></div>
              <div><p className="text-slate-500">Status</p><span className={STATUS_BADGE[searchResult.status]}>{searchResult.status}</span></div>
              <div><p className="text-slate-500">Warranty until</p><p className="font-medium">{searchResult.warranty_expiry ?? '—'}</p></div>
              <div><p className="text-slate-500">Sold to</p><p className="font-medium">{searchResult.customer?.business_name ?? '—'}</p></div>
              <div><p className="text-slate-500">Invoice</p><p className="font-medium">{searchResult.sale?.invoice_no ?? '—'}</p></div>
              <div><p className="text-slate-500">Sold at</p><p className="font-medium">{searchResult.sold_at ? new Date(searchResult.sold_at).toLocaleString() : '—'}</p></div>
              <div><p className="text-slate-500">Registered</p><p className="font-medium">{new Date(searchResult.created_at).toLocaleDateString()}</p></div>
            </div>
          )}
        </div>
      )}

      {serials.length === 0 && !loading ? (
        <div className="card flex flex-col items-center gap-2 p-10 text-center">
          <BarcodeIcon className="text-slate-300" size={36} />
          <p className="font-medium text-slate-600 dark:text-slate-300">No serial numbers registered yet</p>
        </div>
      ) : (
        <DataTable
          columns={columns} rows={serials} rowKey={(r) => r.id} loading={loading} exportFilename="serial-numbers"
          searchPlaceholder="Search product or serial…"
          searchFn={(r, q) => r.serial_no.toLowerCase().includes(q) || (r.product?.name ?? '').toLowerCase().includes(q)}
        />
      )}

      <NewSerialModal open={newOpen} onClose={() => setNewOpen(false)} onCreated={reload} />
    </div>
  );
}
