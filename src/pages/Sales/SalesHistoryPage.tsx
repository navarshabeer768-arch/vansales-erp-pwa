import { useState, useEffect } from 'react';
import { Eye, Printer, Bluetooth } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useSales, Sale } from '@/hooks/useSales';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { printReceiptViaBrowser, printReceiptViaBluetooth, isBluetoothPrintingSupported } from '@/lib/bluetoothPrint';

interface SaleItemRow {
  id: string; product_id: string; quantity: number; unit_price: number;
  discount_amount: number; tax_amount: number; line_total: number; is_free_item: boolean;
  product?: { name: string; sku: string };
}
interface SalePaymentRow { id: string; method: string; amount: number; reference_no: string | null; }

function SaleDetailModal({ sale, onClose }: { sale: Sale | null; onClose: () => void }) {
  const [items, setItems] = useState<SaleItemRow[]>([]);
  const [payments, setPayments] = useState<SalePaymentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const { company } = useAuth();
  const { push } = useToast();
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (!sale) return;
    setLoading(true);
    (async () => {
      const [{ data: itemRows }, { data: paymentRows }] = await Promise.all([
        supabase.from('sale_items').select('*, product:products(name,sku)').eq('sale_id', sale.id),
        supabase.from('sale_payments').select('*').eq('sale_id', sale.id),
      ]);
      setItems((itemRows ?? []) as unknown as SaleItemRow[]);
      setPayments((paymentRows ?? []) as SalePaymentRow[]);
      setLoading(false);
    })();
  }, [sale]);

  const buildReceiptData = () => {
    if (!sale) return null;
    return {
      companyName: company?.name ?? 'Van Sales',
      storeId: company?.store_id ?? '—',
      invoiceNo: sale.invoice_no,
      createdAt: sale.created_at,
      customerName: sale.customer?.business_name ?? 'Walk-in',
      items: items.map((it) => ({ name: it.product?.name ?? '—', quantity: it.quantity, unitPrice: it.unit_price, lineTotal: it.line_total })),
      subtotal: sale.subtotal, discount: sale.discount_amount, tax: sale.tax_amount,
      total: sale.total_amount, paid: sale.paid_amount, balance: sale.balance_amount,
    };
  };

  const handlePrintBluetooth = async () => {
    const data = buildReceiptData();
    if (!data) return;
    setPrinting(true);
    try {
      await printReceiptViaBluetooth(data);
      push('success', 'Sent to printer.');
    } catch (err) {
      push('error', err instanceof Error ? err.message : 'Failed to print.');
    }
    setPrinting(false);
  };

  const handlePrintBrowser = () => {
    const data = buildReceiptData();
    if (!data) return;
    printReceiptViaBrowser(data);
  };

  return (
    <Modal open={!!sale} onClose={onClose} title={sale ? `Invoice ${sale.invoice_no}` : ''} size="lg">
      {sale && (
        <div className="space-y-4">
          <div className="flex justify-end gap-2">
            {isBluetoothPrintingSupported() && (
              <button className="btn-secondary" onClick={handlePrintBluetooth} disabled={printing || loading}>
                <Bluetooth size={16} /> {printing ? 'Printing…' : 'Print (thermal)'}
              </button>
            )}
            <button className="btn-secondary" onClick={handlePrintBrowser} disabled={loading}>
              <Printer size={16} /> Print (A4)
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div><p className="text-slate-500">Customer</p><p className="font-medium">{sale.customer?.business_name ?? 'Walk-in'}</p></div>
            <div><p className="text-slate-500">Van</p><p className="font-medium">{sale.van?.name ?? '—'}</p></div>
            <div><p className="text-slate-500">Type</p><p className="font-medium capitalize">{sale.sale_type}</p></div>
            <div><p className="text-slate-500">Date</p><p className="font-medium">{new Date(sale.created_at).toLocaleString()}</p></div>
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="table-base">
              <thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Discount</th><th>Tax</th><th>Total</th></tr></thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="py-6 text-center text-slate-400">Loading…</td></tr>
                ) : items.map((it) => (
                  <tr key={it.id}>
                    <td>{it.product?.name}{it.is_free_item && <span className="badge-slate ml-2">FREE</span>}</td>
                    <td>{it.quantity}</td>
                    <td>{it.unit_price.toFixed(2)}</td>
                    <td>{it.discount_amount.toFixed(2)}</td>
                    <td>{it.tax_amount.toFixed(2)}</td>
                    <td className="font-medium">{it.line_total.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="mb-1 text-sm font-medium text-slate-600 dark:text-slate-300">Payments</p>
              {payments.length === 0 ? (
                <p className="text-sm text-slate-400">No payments recorded (fully on credit).</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {payments.map((p) => (
                    <li key={p.id} className="flex justify-between">
                      <span className="capitalize text-slate-500">{p.method}{p.reference_no ? ` · ${p.reference_no}` : ''}</span>
                      <span>{p.amount.toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>{sale.subtotal.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Discount</span><span>-{sale.discount_amount.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Tax</span><span>{sale.tax_amount.toFixed(2)}</span></div>
              <div className="flex justify-between font-bold"><span>Total</span><span>{sale.total_amount.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Paid</span><span>{sale.paid_amount.toFixed(2)}</span></div>
              <div className="flex justify-between text-red-600"><span>Balance</span><span>{sale.balance_amount.toFixed(2)}</span></div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function SalesHistoryPage() {
  const { sales, loading } = useSales();
  const [viewing, setViewing] = useState<Sale | null>(null);

  const columns: Column<Sale>[] = [
    { key: 'invoice_no', header: 'Invoice #', sortValue: (r) => r.invoice_no, render: (r) => <span className="font-medium">{r.invoice_no}</span> },
    { key: 'customer', header: 'Customer', render: (r) => r.customer?.business_name ?? 'Walk-in' },
    { key: 'van', header: 'Van', render: (r) => r.van?.name ?? '—' },
    { key: 'type', header: 'Type', render: (r) => <span className="capitalize">{r.sale_type}</span> },
    { key: 'total', header: 'Total', sortValue: (r) => r.total_amount, render: (r) => r.total_amount.toFixed(2) },
    {
      key: 'balance', header: 'Balance', sortValue: (r) => r.balance_amount,
      render: (r) => r.balance_amount > 0
        ? <span className="badge-amber">{r.balance_amount.toFixed(2)} due</span>
        : <span className="badge-green">Paid</span>,
    },
    { key: 'created_at', header: 'Date', sortValue: (r) => r.created_at, render: (r) => new Date(r.created_at).toLocaleString() },
    {
      key: 'actions', header: '', className: 'text-right',
      render: (r) => <button className="btn-ghost !px-2 !py-1" onClick={() => setViewing(r)}><Eye size={16} /></button>,
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Sales History</h1>
        <p className="text-sm text-slate-500">All completed sales across every van.</p>
      </div>
      <DataTable
        columns={columns} rows={sales} rowKey={(r) => r.id} loading={loading}
        searchPlaceholder="Search invoice or customer…"
        searchFn={(r, q) => r.invoice_no.toLowerCase().includes(q) || (r.customer?.business_name ?? '').toLowerCase().includes(q)}
        emptyMessage="No sales recorded yet."
        exportFilename="sales-history"
      />
      <SaleDetailModal sale={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}
