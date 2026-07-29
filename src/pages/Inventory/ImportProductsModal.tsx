import { useRef, useState } from 'react';
import { Upload, Download, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useProducts, ProductInput } from '@/hooks/useProducts';
import { useCategories, useBrands, useUnits } from '@/hooks/useCatalog';
import { parseCsv } from '@/lib/csvImport';
import { exportRowsToCsv } from '@/lib/csvExport';
import { useToast } from '@/contexts/ToastContext';

interface ParsedRow {
  raw: Record<string, string>;
  rowNumber: number;
  valid: boolean;
  error?: string;
  input?: ProductInput;
}

const TEMPLATE_HEADERS = [
  'sku', 'name', 'description', 'barcode', 'category', 'brand', 'unit',
  'cost_price', 'selling_price', 'wholesale_price', 'retail_price', 'tax_rate', 'min_stock', 'max_stock',
];

export function ImportProductsModal({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: () => void }) {
  const { importProducts } = useProducts();
  const { rows: categories } = useCategories();
  const { rows: brands } = useBrands();
  const { rows: units } = useUnits();
  const { push } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ successCount: number; errors: string[] } | null>(null);

  const reset = () => { setParsedRows([]); setResult(null); if (fileInputRef.current) fileInputRef.current.value = ''; };

  const downloadCsvTemplate = () => {
    exportRowsToCsv('product-import-template', TEMPLATE_HEADERS, [
      ['SKU-001', 'Sample Product', 'Optional description', '', '', '', 'PC', '5.00', '8.00', '', '', '0', '10', ''],
    ]);
  };

  const downloadExcelTemplate = async () => {
    const { exportRowsToExcel } = await import('@/lib/excelIO');
    exportRowsToExcel('product-import-template', TEMPLATE_HEADERS, [
      ['SKU-001', 'Sample Product', 'Optional description', '', '', '', 'PC', '5.00', '8.00', '', '', '0', '10', ''],
    ]);
  };

  const handleFile = async (file: File) => {
    const isExcel = /\.xlsx?$/i.test(file.name);
    let csvRows: Record<string, string>[];
    if (isExcel) {
      const { parseExcelFile } = await import('@/lib/excelIO');
      csvRows = await parseExcelFile(file);
    } else {
      csvRows = parseCsv(await file.text());
    }
    if (csvRows.length === 0) {
      push('error', 'That file has no data rows.');
      return;
    }

    const parsed: ParsedRow[] = csvRows.map((raw, idx) => {
      const rowNumber = idx + 2; // +1 for header row, +1 for 1-indexing
      const sku = raw.sku?.trim();
      const name = raw.name?.trim();
      const unitSymbol = raw.unit?.trim();

      if (!sku || !name) return { raw, rowNumber, valid: false, error: 'Missing SKU or name' };

      const unit = units.find((u) => u.symbol.toLowerCase() === unitSymbol?.toLowerCase());
      if (!unit) return { raw, rowNumber, valid: false, error: `Unknown unit "${unitSymbol}" — add it in Catalog settings first` };

      const category = categories.find((c) => c.name.toLowerCase() === raw.category?.trim().toLowerCase());
      const brand = brands.find((b) => b.name.toLowerCase() === raw.brand?.trim().toLowerCase());

      const input: ProductInput = {
        sku, name, description: raw.description || null, barcode: raw.barcode || null, qr_code: null,
        image_url: null, weight: null, volume: null,
        category_id: category?.id ?? null, brand_id: brand?.id ?? null, supplier_id: null,
        base_unit_id: unit.id,
        cost_price: Number(raw.cost_price) || 0, selling_price: Number(raw.selling_price) || 0,
        wholesale_price: raw.wholesale_price ? Number(raw.wholesale_price) : null,
        retail_price: raw.retail_price ? Number(raw.retail_price) : null,
        offer_price: null,
        tax_rate: Number(raw.tax_rate) || 0,
        min_stock: Number(raw.min_stock) || 0,
        max_stock: raw.max_stock ? Number(raw.max_stock) : null,
        track_batches: false, track_expiry: false, track_serials: false, is_active: true,
      };
      return { raw, rowNumber, valid: true, input };
    });

    setParsedRows(parsed);
  };

  const validRows = parsedRows.filter((r) => r.valid && r.input);
  const invalidRows = parsedRows.filter((r) => !r.valid);

  const handleImport = async () => {
    if (validRows.length === 0) return;
    setImporting(true);
    const { successCount, errors } = await importProducts(validRows.map((r) => r.input!));
    setImporting(false);
    setResult({ successCount, errors });
    if (successCount > 0) onImported();
  };

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title="Import products from CSV / Excel" size="lg">
      <div className="space-y-4">
        {!result && (
          <>
            <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800">
              <span className="text-slate-600 dark:text-slate-300">
                Need the format? Download a template with the right columns.
              </span>
              <div className="flex gap-2">
                <button className="btn-secondary !py-1.5" onClick={downloadCsvTemplate}>
                  <Download size={14} /> CSV
                </button>
                <button className="btn-secondary !py-1.5" onClick={downloadExcelTemplate}>
                  <Download size={14} /> Excel
                </button>
              </div>
            </div>

            <div>
              <label className="label">CSV or Excel file</label>
              <input
                ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="input"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
              <p className="mt-1 text-xs text-slate-500">
                Required columns: sku, name, unit (must match an existing unit symbol, e.g. PC, CTN).
                Category and brand are matched by name if provided, left blank otherwise.
              </p>
            </div>

            {parsedRows.length > 0 && (
              <>
                <div className="flex gap-4 text-sm">
                  <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 size={14} /> {validRows.length} ready to import</span>
                  {invalidRows.length > 0 && (
                    <span className="flex items-center gap-1 text-red-600"><AlertCircle size={14} /> {invalidRows.length} with errors</span>
                  )}
                </div>

                <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
                  <table className="table-base">
                    <thead><tr><th>Row</th><th>SKU</th><th>Name</th><th>Status</th></tr></thead>
                    <tbody>
                      {parsedRows.map((r) => (
                        <tr key={r.rowNumber}>
                          <td>{r.rowNumber}</td>
                          <td>{r.raw.sku || '—'}</td>
                          <td>{r.raw.name || '—'}</td>
                          <td>
                            {r.valid ? <span className="badge-green">Ready</span> : <span className="badge-red" title={r.error}>{r.error}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-secondary" onClick={() => { reset(); onClose(); }} disabled={importing}>Cancel</button>
              <button className="btn-primary" onClick={handleImport} disabled={importing || validRows.length === 0}>
                <Upload size={16} /> {importing ? 'Importing…' : `Import ${validRows.length} product${validRows.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </>
        )}

        {result && (
          <div className="space-y-4 text-center">
            <CheckCircle2 className="mx-auto text-emerald-600" size={40} />
            <p className="font-medium text-slate-800 dark:text-slate-100">
              Imported {result.successCount} of {parsedRows.length} rows.
            </p>
            {result.errors.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded-lg bg-red-50 p-3 text-left text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
                {result.errors.map((e, i) => <p key={i}>{e}</p>)}
              </div>
            )}
            <button className="btn-primary" onClick={() => { reset(); onClose(); }}>Done</button>
          </div>
        )}
      </div>
    </Modal>
  );
}
