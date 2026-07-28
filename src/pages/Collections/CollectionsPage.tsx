import { useEffect, useState } from 'react';
import { HandCoins } from 'lucide-react';
import {
  useOutstandingCustomers, useCollections, fetchOpenSalesForCustomer,
  CustomerWithBalance, OpenSale, Collection,
} from '@/hooks/useCollections';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';

const METHODS: Collection['method'][] = ['cash', 'card', 'bank', 'cheque', 'pdc'];

function CollectModal({ customer, onClose, onDone }: {
  customer: CustomerWithBalance | null; onClose: () => void; onDone: () => void;
}) {
  const { recordCollection } = useCollections();
  const { push } = useToast();
  const [method, setMethod] = useState<Collection['method']>('cash');
  const [amount, setAmount] = useState(0);
  const [referenceNo, setReferenceNo] = useState('');
  const [chequeDate, setChequeDate] = useState('');
  const [openSales, setOpenSales] = useState<OpenSale[]>([]);
  const [appliedSaleId, setAppliedSaleId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!customer) { setOpenSales([]); return; }
    setAmount(Math.min(customer.outstanding_balance, customer.outstanding_balance));
    fetchOpenSalesForCustomer(customer.id).then(setOpenSales);
  }, [customer]);

  const submit = async () => {
    if (!customer) return;
    setSubmitting(true);
    const { error } = await recordCollection({
      customerId: customer.id, method, amount, referenceNo, chequeDate,
      appliedToSaleId: appliedSaleId || null,
    });
    setSubmitting(false);
    if (error) { push('error', error); return; }
    push('success', 'Collection recorded.');
    onDone();
    onClose();
  };

  return (
    <Modal open={!!customer} onClose={onClose} title={customer ? `Collect from ${customer.business_name}` : ''} size="sm">
      {customer && (
        <div className="space-y-4">
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
            Outstanding balance: <strong>{customer.outstanding_balance.toFixed(2)}</strong>
          </div>

          {openSales.length > 0 && (
            <div>
              <label className="label">Apply to invoice (optional)</label>
              <select className="input" value={appliedSaleId} onChange={(e) => setAppliedSaleId(e.target.value)}>
                <option value="">— General payment (not tied to one invoice) —</option>
                {openSales.map((s) => (
                  <option key={s.id} value={s.id}>{s.invoice_no} — due {s.balance_amount.toFixed(2)}</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Method</label>
              <select className="input" value={method} onChange={(e) => setMethod(e.target.value as Collection['method'])}>
                {METHODS.map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Amount</label>
              <input type="number" min={0} step="0.01" className="input" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
            </div>
          </div>

          {(method === 'cheque' || method === 'pdc') && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Cheque #</label>
                <input className="input" value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} />
              </div>
              <div>
                <label className="label">Cheque date</label>
                <input type="date" className="input" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} />
              </div>
            </div>
          )}
          {(method === 'card' || method === 'bank') && (
            <div>
              <label className="label">Reference #</label>
              <input className="input" value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button className="btn-secondary" onClick={onClose} disabled={submitting}>Cancel</button>
            <button className="btn-primary" onClick={submit} disabled={submitting || amount <= 0}>
              {submitting ? 'Recording…' : `Record ${amount.toFixed(2)}`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function CollectionsPage() {
  const { customers, loading, reload: reloadOutstanding } = useOutstandingCustomers();
  const { collections, loading: loadingHistory, reload: reloadHistory } = useCollections();
  const [collecting, setCollecting] = useState<CustomerWithBalance | null>(null);

  const refreshAll = () => { reloadOutstanding(); reloadHistory(); };

  const outstandingColumns: Column<CustomerWithBalance>[] = [
    { key: 'name', header: 'Customer', sortValue: (r) => r.business_name, render: (r) => (
      <div><p className="font-medium">{r.business_name}</p><p className="text-xs text-slate-500">{r.customer_code}</p></div>
    ) },
    { key: 'balance', header: 'Outstanding', sortValue: (r) => r.outstanding_balance, render: (r) => (
      <span className="font-semibold text-red-600">{r.outstanding_balance.toFixed(2)}</span>
    ) },
    { key: 'limit', header: 'Credit limit', render: (r) => r.credit_limit.toFixed(2) },
    {
      key: 'actions', header: '', className: 'text-right',
      render: (r) => (
        <PermissionGate permission="collections:create">
          <button className="btn-primary !py-1" onClick={() => setCollecting(r)}>Collect</button>
        </PermissionGate>
      ),
    },
  ];

  const historyColumns: Column<Collection>[] = [
    { key: 'receipt_no', header: 'Receipt #', render: (r) => <span className="font-medium">{r.receipt_no}</span> },
    { key: 'customer', header: 'Customer', render: (r) => r.customer?.business_name ?? '—' },
    { key: 'method', header: 'Method', render: (r) => <span className="capitalize">{r.method}</span> },
    { key: 'amount', header: 'Amount', render: (r) => r.amount.toFixed(2) },
    { key: 'created_at', header: 'Date', render: (r) => new Date(r.created_at).toLocaleString() },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Collections</h1>
        <p className="text-sm text-slate-500">Outstanding customer balances and receipt history.</p>
      </div>

      {customers.length === 0 && !loading ? (
        <div className="card flex flex-col items-center gap-2 p-10 text-center">
          <HandCoins className="text-slate-300" size={36} />
          <p className="font-medium text-slate-600 dark:text-slate-300">No outstanding balances</p>
          <p className="text-sm text-slate-500">Every customer is settled up.</p>
        </div>
      ) : (
        <DataTable columns={outstandingColumns} rows={customers} rowKey={(r) => r.id} loading={loading}
          searchPlaceholder="Search customers…" searchFn={(r, q) => r.business_name.toLowerCase().includes(q)} />
      )}

      <div>
        <h2 className="mb-2 text-lg font-semibold text-slate-800 dark:text-slate-100">Recent collections</h2>
        <DataTable columns={historyColumns} rows={collections} rowKey={(r) => r.id} loading={loadingHistory}
          emptyMessage="No collections recorded yet." />
      </div>

      <CollectModal customer={collecting} onClose={() => setCollecting(null)} onDone={refreshAll} />
    </div>
  );
}
