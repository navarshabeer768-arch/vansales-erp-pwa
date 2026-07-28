import { useState } from 'react';
import { Plus, Receipt } from 'lucide-react';
import { useExpenses, Expense } from '@/hooks/useExpenses';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';

const CATEGORIES = ['Fuel', 'Vehicle maintenance', 'Rent', 'Salaries', 'Utilities', 'Supplies', 'Marketing', 'Other'];

function NewExpenseModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { createExpense } = useExpenses();
  const { push } = useToast();
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [amount, setAmount] = useState(0);
  const [paidVia, setPaidVia] = useState<'cash' | 'bank'>('cash');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    const { error } = await createExpense({ category, amount, paidVia, notes });
    setSubmitting(false);
    if (error) { push('error', error); return; }
    push('success', 'Expense recorded.');
    setAmount(0); setNotes('');
    onCreated();
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="New expense" size="sm">
      <div className="space-y-4">
        <div>
          <label className="label">Category</label>
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Amount</label>
            <input type="number" min={0} step="0.01" className="input" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
          </div>
          <div>
            <label className="label">Paid via</label>
            <select className="input" value={paidVia} onChange={(e) => setPaidVia(e.target.value as 'cash' | 'bank')}>
              <option value="cash">Cash</option>
              <option value="bank">Bank</option>
            </select>
          </div>
        </div>
        <div>
          <label className="label">Notes</label>
          <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={onClose} disabled={submitting}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={submitting || amount <= 0}>
            {submitting ? 'Saving…' : 'Record expense'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function ExpensesPage() {
  const { expenses, loading, reload } = useExpenses();
  const [newOpen, setNewOpen] = useState(false);

  const columns: Column<Expense>[] = [
    { key: 'expense_no', header: 'Expense #', render: (r) => <span className="font-medium">{r.expense_no}</span> },
    { key: 'category', header: 'Category' },
    { key: 'amount', header: 'Amount', sortValue: (r) => r.amount, render: (r) => r.amount.toFixed(2) },
    { key: 'paid_via', header: 'Paid via', render: (r) => <span className="capitalize">{r.paid_via}</span> },
    { key: 'notes', header: 'Notes', render: (r) => r.notes ?? '—' },
    { key: 'created_at', header: 'Date', render: (r) => new Date(r.created_at).toLocaleString() },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Expenses</h1>
          <p className="text-sm text-slate-500">Operating costs — fuel, maintenance, rent, and more.</p>
        </div>
        <PermissionGate permission="accounting:create">
          <button className="btn-primary" onClick={() => setNewOpen(true)}><Plus size={16} /> New expense</button>
        </PermissionGate>
      </div>

      {expenses.length === 0 && !loading ? (
        <div className="card flex flex-col items-center gap-2 p-10 text-center">
          <Receipt className="text-slate-300" size={36} />
          <p className="font-medium text-slate-600 dark:text-slate-300">No expenses recorded yet</p>
        </div>
      ) : (
        <DataTable columns={columns} rows={expenses} rowKey={(r) => r.id} loading={loading} />
      )}

      <NewExpenseModal open={newOpen} onClose={() => setNewOpen(false)} onCreated={reload} />
    </div>
  );
}
