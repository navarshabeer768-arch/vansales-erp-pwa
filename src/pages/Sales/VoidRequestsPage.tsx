import { useNavigate } from 'react-router-dom';
import { AlertOctagon, Check, X } from 'lucide-react';
import { useVoidRequestQueue } from '@/hooks/useInvoiceVoidRequest';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';

export function VoidRequestsPage() {
  const { requests, loading, decide } = useVoidRequestQueue();
  const { push } = useToast();
  const navigate = useNavigate();

  const handleApprove = async (id: string) => {
    if (!confirm('Approve this void? The invoice will be marked voided. Stock and ledger reversal is not automatic yet — handle that manually until Sales Returns / Credit Notes ships.')) return;
    const { error } = await decide(id, true);
    if (error) push('error', error); else push('success', 'Void approved.');
  };

  const handleReject = async (id: string) => {
    const reason = prompt('Reason for rejecting this void request:');
    if (!reason) return;
    const { error } = await decide(id, false, reason);
    if (error) push('error', error); else push('success', 'Void request rejected.');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-slate-100">
          <AlertOctagon size={20} /> Void Requests
        </h1>
        <p className="text-sm text-slate-500">
          Requests to void a posted invoice. Approving marks the invoice voided but does not reverse stock or the
          customer ledger — that reversal is handled later through Sales Returns / Credit Notes.
        </p>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-700">
              <th className="p-3">Invoice</th><th className="p-3">Customer</th><th className="p-3">Amount</th>
              <th className="p-3">Reason</th><th className="p-3">Requested</th><th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="p-4 text-center text-slate-400">Loading…</td></tr>}
            {!loading && requests.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-slate-400">No pending void requests.</td></tr>}
            {requests.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800">
                <td className="p-3">
                  <button className="font-medium text-blue-600 hover:underline dark:text-blue-400" onClick={() => navigate(`/sales/invoices/${r.invoice_id}`)}>
                    {r.invoice?.invoice_number ?? r.invoice_id}
                  </button>
                </td>
                <td className="p-3">{r.invoice?.customer?.business_name ?? '—'}</td>
                <td className="p-3">{r.invoice?.net_amount?.toFixed(2) ?? '—'}</td>
                <td className="p-3">{r.reason}</td>
                <td className="p-3">{new Date(r.request_date).toLocaleString()}</td>
                <td className="p-3 text-right">
                  <div className="flex justify-end gap-2">
                    <PermissionGate permission="sales_invoices:approve_void">
                      <button className="btn-secondary !py-1 text-xs text-green-600" onClick={() => handleApprove(r.id)}><Check size={12} /> Approve</button>
                    </PermissionGate>
                    <PermissionGate permission="sales_invoices:approve_void">
                      <button className="btn-secondary !py-1 text-xs text-red-600" onClick={() => handleReject(r.id)}><X size={12} /> Reject</button>
                    </PermissionGate>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
