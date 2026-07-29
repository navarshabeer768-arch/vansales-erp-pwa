import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, ClipboardList } from 'lucide-react';
import { differenceInCalendarDays } from 'date-fns';
import { useWarehouses } from '@/hooks/useWarehouses';
import { useWarehouseStock } from '@/hooks/useWarehouseStock';
import { useWarehouseLocations, assignStockLocation } from '@/hooks/useWarehouseLocations';
import { useToast } from '@/contexts/ToastContext';
import { DataTable, Column } from '@/components/ui/DataTable';
import type { WarehouseStock } from '@/types/database';
import { PermissionGate } from '@/components/common/PermissionGate';

function expiryBadge(expiryDate: string | null | undefined) {
  if (!expiryDate) return null;
  const days = differenceInCalendarDays(new Date(expiryDate), new Date());
  if (days < 0) return <span className="badge-red">Expired</span>;
  if (days <= 30) return <span className="badge-amber">{days}d left</span>;
  return <span className="badge-slate">{expiryDate}</span>;
}

export function StockPage() {
  const { warehouseId } = useParams<{ warehouseId: string }>();
  const { warehouses } = useWarehouses();
  const { stock, loading, reload } = useWarehouseStock(warehouseId ?? null);
  const { locations } = useWarehouseLocations(warehouseId ?? null);
  const { push } = useToast();
  const warehouse = warehouses.find((w) => w.id === warehouseId);

  const handleAssignLocation = async (stockId: string, locationId: string) => {
    const { error } = await assignStockLocation(stockId, locationId || null);
    push(error ? 'error' : 'success', error ?? 'Location updated.');
    if (!error) reload();
  };

  const columns: Column<WarehouseStock>[] = [
    { key: 'product', header: 'Product', sortValue: (r) => r.product?.name ?? '', render: (r) => (
      <div><p className="font-medium">{r.product?.name}</p><p className="text-xs text-slate-500">{r.product?.sku}</p></div>
    ) },
    { key: 'batch', header: 'Batch', render: (r) => r.batch?.batch_no ?? '—' },
    { key: 'location', header: 'Location', render: (r) => (
      <select
        className="input !w-32 !py-1.5" value={r.location_id ?? ''}
        onChange={(e) => handleAssignLocation(r.id, e.target.value)}
      >
        <option value="">— None —</option>
        {locations.map((loc) => <option key={loc.id} value={loc.id}>{loc.code}</option>)}
      </select>
    ) },
    { key: 'expiry', header: 'Expiry', render: (r) => expiryBadge(r.batch?.expiry_date) ?? '—' },
    { key: 'quantity', header: 'On hand', sortValue: (r) => r.quantity, render: (r) => (
      <span className={r.quantity <= 0 ? 'font-semibold text-red-600' : 'font-semibold'}>{r.quantity}</span>
    ) },
    { key: 'reserved', header: 'Reserved', render: (r) => r.reserved_quantity },
    { key: 'available', header: 'Available', render: (r) => (r.quantity - r.reserved_quantity).toFixed(2) },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/warehouse" className="btn-ghost !px-2 !py-1"><ArrowLeft size={18} /></Link>
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">{warehouse?.name ?? 'Warehouse'} — Stock</h1>
          <p className="text-sm text-slate-500">Live on-hand quantities by product and batch.</p>
        </div>
        <PermissionGate permission="warehouse:approve">
          <Link to={`/warehouse/adjustments/${warehouseId}`} className="btn-secondary ml-auto">
            <ClipboardList size={16} /> Stock adjustments
          </Link>
        </PermissionGate>
      </div>

      <DataTable
        columns={columns}
        rows={stock}
        rowKey={(r) => r.id}
        loading={loading}
        searchPlaceholder="Search product…"
        searchFn={(r, q) => (r.product?.name ?? '').toLowerCase().includes(q) || (r.product?.sku ?? '').toLowerCase().includes(q)}
        emptyMessage="No stock recorded for this warehouse yet."
        exportFilename="warehouse-stock"
      />
    </div>
  );
}
