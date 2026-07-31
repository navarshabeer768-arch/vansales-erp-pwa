import { useState } from 'react';
import { Star, Search, History } from 'lucide-react';
import { useProducts } from '@/hooks/useProducts';
import { useRecentAndFavouriteProducts } from '@/hooks/useRecentAndFavouriteProducts';
import { useScanHistory } from '@/hooks/useScanHistory';
import { UniversalScanner } from '@/components/common/UniversalScanner';
import { ScanLookupResult } from '@/hooks/useScanLookup';
import { DataTable, Column } from '@/components/ui/DataTable';
import type { ScanLogRow } from '@/hooks/useScanHistory';

export function QuickScanPage() {
  const { products } = useProducts();
  const { recent, favourites, recordView, toggleFavourite, isFavourite } = useRecentAndFavouriteProducts();
  const { logs, loading } = useScanHistory();
  const [query, setQuery] = useState('');
  const [, setLastFound] = useState<ScanLookupResult | null>(null);

  const matches = query.trim().length === 0 ? [] : products.filter((p) =>
    p.name.toLowerCase().includes(query.toLowerCase()) || p.sku.toLowerCase().includes(query.toLowerCase()) || (p.barcode ?? '').includes(query)
  ).slice(0, 20);

  const handleScanResult = (result: ScanLookupResult) => {
    setLastFound(result);
    if (result.type === 'product' && result.id) recordView(result.id);
  };

  const columns: Column<ScanLogRow>[] = [
    { key: 'value', header: 'Scanned value', render: (r) => r.scanned_value },
    { key: 'type', header: 'Scan type', render: (r) => <span className="uppercase">{r.scan_type}</span> },
    { key: 'lookup', header: 'Matched', render: (r) => r.lookup_success ? <span className="badge-green">{r.lookup_type}</span> : <span className="badge-red">No match</span> },
    { key: 'context', header: 'Screen', render: (r) => r.context ?? '—' },
    { key: 'employee', header: 'Employee', render: (r) => r.employee?.full_name ?? '—' },
    { key: 'when', header: 'When', sortValue: (r) => r.created_at, render: (r) => new Date(r.created_at).toLocaleString() },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Quick Scan &amp; Fast Search</h1>
        <p className="text-sm text-slate-500">Scan a barcode/QR with any connected scanner, or search by name/SKU/barcode.</p>
      </div>

      <div className="card p-4">
        <UniversalScanner context="quick_scan" onResult={handleScanResult} />
      </div>

      <div className="card p-4">
        <label className="label flex items-center gap-1.5"><Search size={14} /> Search products</label>
        <input className="input" placeholder="Name, SKU, or barcode…" value={query} onChange={(e) => setQuery(e.target.value)} />
        {matches.length > 0 && (
          <div className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
            {matches.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-3 py-2">
                <div>
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-slate-500">{p.sku} {p.barcode ? `· ${p.barcode}` : ''}</p>
                </div>
                <button onClick={() => toggleFavourite(p.id)} className={isFavourite(p.id) ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'}>
                  <Star size={18} className={isFavourite(p.id) ? 'fill-amber-400' : ''} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="card p-4">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300"><History size={14} /> Recent products</h2>
          {recent.length === 0 ? <p className="text-sm text-slate-400">No recent activity yet.</p> : (
            <div className="flex flex-wrap gap-2">
              {recent.map((r) => <span key={r.product_id} className="badge-slate">{r.product?.name ?? '—'}</span>)}
            </div>
          )}
        </div>
        <div className="card p-4">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300"><Star size={14} /> Favourite products</h2>
          {favourites.length === 0 ? <p className="text-sm text-slate-400">No favourites yet — tap the star next to a search result.</p> : (
            <div className="flex flex-wrap gap-2">
              {favourites.map((f) => <span key={f.product_id} className="badge-amber">{f.product?.name ?? '—'}</span>)}
            </div>
          )}
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-lg font-semibold text-slate-800 dark:text-slate-100">Scan history</h2>
        <DataTable columns={columns} rows={logs} rowKey={(r) => r.id} loading={loading} exportFilename="scan-history" />
      </div>
    </div>
  );
}
