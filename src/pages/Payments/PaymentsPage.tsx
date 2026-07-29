import { useState } from 'react';
import { Wallet } from 'lucide-react';
import { useSuppliersWithPayable, useSupplierPayments, SupplierWithPayable, SupplierPayment } from '@/hooks/useSupplierPayments';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';

const METHODS: SupplierPayment['method'][] = ['cash', 'bank', 'cheque'];

function PayModal({ supplier, onClose, onDone }: {
  supplier: SupplierWithPayable | null; onClose: () => void; onDone: () => void;
}) {
  const { recordPayment } = useSupplierPayments();
  const { push } = useToast();
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<SupplierPayment['method']>('cash');
  const [referenceNo, setReferenceNo] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!supplier) return;
    setSubmitting(true);
    const { error } = await recordPayment({ supplierId: supplier.id, amount, method, referenceNo });
    setSubmitting(false);
    if (error) { push('error', error); return; }
    push('success', 'Payment recorded.');
    onDone();
    onClose();
  };

  return (
    <Modal open={!!supplier} onClose={onClose} title={supplier ? `Pay ${supplier.name}` : ''} size="sm">
      {supplier && (
        <div className="space-y-4">
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
            Outstanding: <strong>{supplier.outstanding_payable.toFixed(2)}</strong>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Method</label>
              <select className="input" value={method} onChange={(e) => setMethod(e.target.value as SupplierPayment['method'])}>
                {METHODS.map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Amount</label>
              <input type="number" min={0} step="0.01" className="input" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
            </div>
          </div>
          {method !== 'cash' && (
            <div>
              <label className="label">Reference #</label>
              <input className="input" value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} />
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button className="btn-secondary" onClick={onClose} disabled={submitting}>Cancel</button>
            <button className="btn-primary" onClick={submit} disabled={submitting || amount <= 0}>
              {submitting ? 'Recording…' : `Pay ${amount.toFixed(2)}`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function PaymentsPage() {
  const { suppliers, loading, reload: reloadOutstanding } = useSuppliersWithPayable();
  const { payments, loading: loadingHistory, reload: reloadHistory } = useSupplierPayments();
  const [paying, setPaying] = useState<SupplierWithPayable | null>(null);

  const refreshAll = () => { reloadOutstanding(); reloadHistory(); };

  const outstandingColumns: Column<SupplierWithPayable>[] = [
    { key: 'name', header: 'Supplier', sortValue: (r) => r.name, render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'phone', header: 'Phone', render: (r) => r.phone ?? '—' },
    { key: 'payable', header: 'Outstanding', sortValue: (r) => r.outstanding_payable, render: (r) => (
      <span className="font-semibold text-red-600">{r.outstanding_payable.toFixed(2)}</span>
    ) },
    {
      key: 'actions', header: '', className: 'text-right',
      render: (r) => (
        <PermissionGate permission="payments:create">
          <button className="btn-primary !py-1" onClick={() => setPaying(r)}>Pay</button>
        </PermissionGate>
      ),
    },
  ];

  const historyColumns: Column<SupplierPayment>[] = [
    { key: 'supplier', header: 'Supplier', render: (r) => r.supplier?.name ?? '—' },
    { key: 'method', header: 'Method', render: (r) => <span className="capitalize">{r.method}</span> },
    { key: 'reference', header: 'Reference #', render: (r) => r.reference_no ?? '—' },
    { key: 'amount', header: 'Amount', render: (r) => r.amount.toFixed(2) },
    { key: 'created_at', header: 'Date', render: (r) => new Date(r.created_at).toLocaleString() },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Payments</h1>
        <p className="text-sm text-slate-500">What you owe suppliers, and payment history.</p>
      </div>

      {suppliers.length === 0 && !loading ? (
        <div className="card flex flex-col items-center gap-2 p-10 text-center">
          <Wallet className="text-slate-300" size={36} />
          <p className="font-medium text-slate-600 dark:text-slate-300">No outstanding supplier balances</p>
          <p className="text-sm text-slate-500">Every supplier is settled up.</p>
        </div>
      ) : (
        <DataTable columns={outstandingColumns} rows={suppliers} rowKey={(r) => r.id} loading={loading}
          searchPlaceholder="Search suppliers…" searchFn={(r, q) => r.name.toLowerCase().includes(q)} />
      )}

      <div>
        <h2 className="mb-2 text-lg font-semibold text-slate-800 dark:text-slate-100">Recent payments</h2>
        <DataTable columns={historyColumns} rows={payments} rowKey={(r) => r.id} loading={loadingHistory}
          emptyMessage="No payments recorded yet." />
      </div>

      <PayModal supplier={paying} onClose={() => setPaying(null)} onDone={refreshAll} />
    </div>
  );
}
