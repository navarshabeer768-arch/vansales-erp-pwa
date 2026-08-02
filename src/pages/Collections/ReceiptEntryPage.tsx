import { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Receipt, Trash2, Save, Send, WifiOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useCustomers } from '@/hooks/useCustomers';
import { useVans } from '@/hooks/useVans';
import { useMyVanIds } from '@/hooks/useVanAssignments';
import { useCollectionTypes } from '@/hooks/useCollectionTypes';
import { useCustomerOutstandingSummary, useCustomerOutstandingInvoices, useAllocationPreview } from '@/hooks/useCustomerOutstanding';
import { useCreateReceiptDraft, PaymentComponentInput } from '@/hooks/useCreateReceiptDraft';
import { useToast } from '@/contexts/ToastContext';

type AllocationMode = 'invoices' | 'advance' | 'unallocated';
const STRATEGIES = [
  { value: 'oldest_due_date_first', label: 'Oldest Due Date First' },
  { value: 'oldest_invoice_first', label: 'Oldest Invoice First' },
  { value: 'most_overdue_first', label: 'Most Overdue First' },
  { value: 'smallest_balance_first', label: 'Smallest Balance First' },
  { value: 'largest_balance_first', label: 'Largest Balance First' },
];

export function ReceiptEntryPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { push } = useToast();
  const { customers } = useCustomers();
  const { vans } = useVans();
  const myVanIds = useMyVanIds();
  const accessibleVans = myVanIds === null ? vans : vans.filter((v) => myVanIds.has(v.id));
  const { collectionTypes } = useCollectionTypes();
  const { submit, submitting } = useCreateReceiptDraft();
  const { preview, previewing } = useAllocationPreview();

  const [customerId, setCustomerId] = useState(searchParams.get('customer_id') ?? '');
  const [collectionTypeCode, setCollectionTypeCode] = useState('customer_collection');
  const [vanId, setVanId] = useState('');
  const [components, setComponents] = useState<PaymentComponentInput[]>([{ payment_method_code: 'cash', amount: 0 }]);
  const [mode, setMode] = useState<AllocationMode>('invoices');
  const [strategy, setStrategy] = useState('oldest_due_date_first');
  const [manualAllocations, setManualAllocations] = useState<Record<string, string>>({});
  const [advancePurpose, setAdvancePurpose] = useState('');
  const [unallocatedReason, setUnallocatedReason] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [remarks, setRemarks] = useState('');
  const [isOffline] = useState(!navigator.onLine);

  const dailyVisitPlanId = searchParams.get('plan_id') ?? undefined;
  const customerVisitId = searchParams.get('visit_id') ?? undefined;

  const { summary } = useCustomerOutstandingSummary(customerId || undefined);
  const { invoices: outstandingInvoices, loading: invoicesLoading } = useCustomerOutstandingInvoices(customerId || undefined);

  const receiptAmount = useMemo(() => components.reduce((sum, c) => sum + (Number(c.amount) || 0), 0), [components]);
  const allocatedTotal = useMemo(() => Object.values(manualAllocations).reduce((sum, v) => sum + (Number(v) || 0), 0), [manualAllocations]);

  const addComponent = () => setComponents((prev) => [...prev, { payment_method_code: 'cash', amount: 0 }]);
  const removeComponent = (idx: number) => setComponents((prev) => prev.filter((_, i) => i !== idx));
  const updateComponent = (idx: number, patch: Partial<PaymentComponentInput>) => {
    setComponents((prev) => prev.map((c, i) => i === idx ? { ...c, ...patch } : c));
  };

  const handleAutoAllocate = async () => {
    if (!customerId || receiptAmount <= 0) { push('error', 'Select a customer and enter payment amount first.'); return; }
    const { data, error } = await preview(customerId, receiptAmount, strategy);
    if (error) { push('error', error); return; }
    const next: Record<string, string> = {};
    (data ?? []).forEach((row) => { next[row.invoice_id] = String(row.proposed_allocation); });
    setManualAllocations(next);
    push('success', 'Allocation proposed — review and adjust before saving.');
  };

  const handleSave = async (submitAfter: boolean) => {
    if (!customerId) { push('error', 'Select a customer.'); return; }
    if (receiptAmount <= 0) { push('error', 'Enter at least one payment component.'); return; }
    if (mode === 'unallocated' && !unallocatedReason.trim()) { push('error', 'Enter a reason for the unallocated receipt.'); return; }

    const invoiceAllocations = mode === 'invoices'
      ? Object.entries(manualAllocations).filter(([, v]) => Number(v) > 0).map(([invoice_id, v]) => ({ invoice_id, amount: Number(v) }))
      : undefined;

    const { data, error } = await submit({
      collectionTypeCode,
      customerId,
      paymentComponents: components.filter((c) => c.amount > 0),
      invoiceAllocations,
      allocationMode: 'manual',
      advanceDetails: mode === 'advance' ? { purpose: advancePurpose || undefined } : null,
      unallocatedReason: mode === 'unallocated' ? unallocatedReason : null,
      vanId: vanId || null,
      responsibleEmployeeId: user?.id ?? null,
      dailyVisitPlanId: dailyVisitPlanId ?? null,
      customerVisitId: customerVisitId ?? null,
      collectionSource: dailyVisitPlanId ? 'route' : 'office',
      referenceNumber: referenceNumber || null,
      remarks: remarks || null,
      isOffline,
    });
    if (error) { push('error', error); return; }
    if (submitAfter && data) {
      const { error: subErr } = await supabase.rpc('change_receipt_status_notified', { p_receipt_id: data, p_new_status: 'submitted' });
      if (subErr) { push('error', `Draft saved but could not submit: ${subErr.message}`); navigate(`/collections/receipts/${data}`); return; }
    }
    push('success', submitAfter ? 'Receipt submitted.' : 'Receipt saved as draft.');
    if (data) navigate(`/collections/receipts/${data}`);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-lg font-bold text-slate-800 dark:text-slate-100">
          <Receipt size={20} /> New Receipt Voucher
        </h1>
        {isOffline && <span className="flex items-center gap-1 text-xs text-red-500"><WifiOff size={14} /> Offline — will sync later</span>}
      </div>

      <div className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">Customer</label>
          <select className="input" value={customerId} onChange={(e) => { setCustomerId(e.target.value); setManualAllocations({}); }}>
            <option value="">Select customer…</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.customer_code} — {c.business_name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Collection Type</label>
          <select className="input" value={collectionTypeCode} onChange={(e) => setCollectionTypeCode(e.target.value)}>
            {collectionTypes.map((t) => <option key={t.id} value={t.code}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Van</label>
          <select className="input" value={vanId} onChange={(e) => setVanId(e.target.value)}>
            <option value="">—</option>
            {accessibleVans.map((v) => <option key={v.id} value={v.id}>{v.code} — {v.name}</option>)}
          </select>
        </div>

        {customerId && summary && (
          <div className="sm:col-span-2 rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-800">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div><p className="text-slate-500">Total Outstanding</p><p className="font-medium">{summary.total_outstanding.toFixed(2)}</p></div>
              <div><p className="text-slate-500">Overdue</p><p className="font-medium text-red-600">{summary.total_overdue.toFixed(2)}</p></div>
              <div><p className="text-slate-500">Open Invoices</p><p className="font-medium">{summary.open_invoices}</p></div>
              <div><p className="text-slate-500">Unallocated Advance</p><p className="font-medium">{summary.unallocated_advance.toFixed(2)}</p></div>
            </div>
          </div>
        )}
      </div>

      <div className="card p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold">Payment Components</h3>
          <button className="text-xs text-blue-600 hover:underline" onClick={addComponent}>+ Add Method</button>
        </div>
        <div className="space-y-2">
          {components.map((c, idx) => (
            <div key={idx} className="rounded-lg border border-slate-100 p-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <select className="input" value={c.payment_method_code} onChange={(e) => updateComponent(idx, { payment_method_code: e.target.value })}>
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cheque">Cheque</option>
                  <option value="online">Online Payment</option>
                  <option value="wallet">Wallet</option>
                </select>
                <input type="number" className="input" placeholder="Amount" value={c.amount || ''} onChange={(e) => updateComponent(idx, { amount: Number(e.target.value) })} />
                {components.length > 1 && (
                  <button className="text-red-500" onClick={() => removeComponent(idx)}><Trash2 size={16} /></button>
                )}
              </div>
              {c.payment_method_code === 'cheque' && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <input className="input" placeholder="Cheque Number" value={c.cheque?.cheque_number ?? ''} onChange={(e) => updateComponent(idx, { cheque: { ...c.cheque, cheque_number: e.target.value, cheque_date: c.cheque?.cheque_date ?? new Date().toISOString().slice(0, 10), bank_name: c.cheque?.bank_name ?? '' } })} />
                  <input type="date" className="input" value={c.cheque?.cheque_date ?? ''} onChange={(e) => updateComponent(idx, { cheque: { ...c.cheque, cheque_number: c.cheque?.cheque_number ?? '', cheque_date: e.target.value, bank_name: c.cheque?.bank_name ?? '' } })} />
                  <input className="input col-span-2" placeholder="Bank Name" value={c.cheque?.bank_name ?? ''} onChange={(e) => updateComponent(idx, { cheque: { ...c.cheque, cheque_number: c.cheque?.cheque_number ?? '', cheque_date: c.cheque?.cheque_date ?? new Date().toISOString().slice(0, 10), bank_name: e.target.value } })} />
                </div>
              )}
              {c.payment_method_code === 'card' && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <input className="input" placeholder="Authorization Code" value={c.card?.authorization_code ?? ''} onChange={(e) => updateComponent(idx, { card: { ...c.card, authorization_code: e.target.value } })} />
                  <input className="input" placeholder="Last 4 Digits" maxLength={4} value={c.card?.last_four_digits ?? ''} onChange={(e) => updateComponent(idx, { card: { ...c.card, last_four_digits: e.target.value } })} />
                </div>
              )}
              {c.payment_method_code === 'bank_transfer' && (
                <div className="mt-2">
                  <input className="input" placeholder="Transfer Reference" value={c.bank?.transfer_reference ?? ''} onChange={(e) => updateComponent(idx, { bank: { ...c.bank, transfer_reference: e.target.value } })} />
                </div>
              )}
              {c.payment_method_code === 'wallet' && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <input className="input" placeholder="Provider" value={c.wallet?.provider ?? ''} onChange={(e) => updateComponent(idx, { wallet: { ...c.wallet, provider: e.target.value } })} />
                  <input className="input" placeholder="Transaction ID" value={c.wallet?.transaction_id ?? ''} onChange={(e) => updateComponent(idx, { wallet: { ...c.wallet, provider: c.wallet?.provider ?? '', transaction_id: e.target.value } })} />
                </div>
              )}
            </div>
          ))}
        </div>
        <p className="mt-2 text-right text-sm font-medium">Total: {receiptAmount.toFixed(2)}</p>
      </div>

      <div className="card p-4">
        <div className="mb-3 flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          {(['invoices', 'advance', 'unallocated'] as AllocationMode[]).map((m) => (
            <button key={m} className={`flex-1 rounded-md py-1.5 text-sm capitalize ${mode === m ? 'bg-white shadow dark:bg-slate-700' : 'text-slate-500'}`} onClick={() => setMode(m)}>
              {m === 'invoices' ? 'Allocate to Invoices' : m}
            </button>
          ))}
        </div>

        {mode === 'invoices' && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <select className="input" value={strategy} onChange={(e) => setStrategy(e.target.value)}>
                {STRATEGIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <button className="btn-secondary whitespace-nowrap" onClick={handleAutoAllocate} disabled={previewing}>Auto Allocate</button>
            </div>
            {invoicesLoading && <p className="text-sm text-slate-500">Loading outstanding invoices…</p>}
            {!invoicesLoading && outstandingInvoices.length === 0 && customerId && <p className="text-sm text-slate-500">No outstanding invoices for this customer.</p>}
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {outstandingInvoices.map((inv) => (
                <div key={inv.invoice_id} className="flex items-center justify-between rounded-lg border border-slate-100 p-2 text-sm dark:border-slate-800">
                  <div>
                    <p className="font-medium">{inv.invoice_number}</p>
                    <p className="text-xs text-slate-500">Due {inv.due_date ?? '—'} · {inv.overdue_days > 0 ? `${inv.overdue_days}d overdue` : 'current'} · Outstanding {inv.outstanding_amount.toFixed(2)}</p>
                  </div>
                  <input
                    type="number" className="input !w-28" placeholder="0.00" min={0} max={inv.outstanding_amount}
                    value={manualAllocations[inv.invoice_id] ?? ''}
                    onChange={(e) => setManualAllocations((prev) => ({ ...prev, [inv.invoice_id]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-between text-sm font-medium">
              <span>Allocated: {allocatedTotal.toFixed(2)}</span>
              <span>Unallocated: {(receiptAmount - allocatedTotal).toFixed(2)}</span>
            </div>
          </div>
        )}

        {mode === 'advance' && (
          <div>
            <label className="label">Purpose</label>
            <input className="input" value={advancePurpose} onChange={(e) => setAdvancePurpose(e.target.value)} placeholder="What is this advance for?" />
          </div>
        )}

        {mode === 'unallocated' && (
          <div>
            <label className="label">Reason *</label>
            <input className="input" value={unallocatedReason} onChange={(e) => setUnallocatedReason(e.target.value)} placeholder="Why is this receipt unallocated?" />
          </div>
        )}
      </div>

      <div className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
        <div>
          <label className="label">Reference Number</label>
          <input className="input" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} />
        </div>
        <div>
          <label className="label">Remarks</label>
          <input className="input" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </div>
      </div>

      <div className="sticky bottom-0 card flex items-center justify-between p-4">
        <div>
          <p className="text-xs text-slate-500">Receipt Amount</p>
          <p className="text-xl font-bold">{receiptAmount.toFixed(2)}</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => handleSave(false)} disabled={submitting}><Save size={16} /> Save Draft</button>
          <button className="btn-primary" onClick={() => handleSave(true)} disabled={submitting}><Send size={16} /> Submit</button>
        </div>
      </div>
    </div>
  );
}
