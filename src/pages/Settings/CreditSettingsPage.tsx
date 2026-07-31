import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { usePaymentTerms, usePaymentMethods, useRiskLevels } from '@/hooks/useCreditLookups';
import { PermissionGate } from '@/components/common/PermissionGate';
import { useToast } from '@/contexts/ToastContext';

type Tab = 'terms' | 'methods' | 'risk';

function codeFrom(label: string) {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function PaymentTermsPanel() {
  const { terms, create, deactivate } = usePaymentTerms();
  const { push } = useToast();
  const [label, setLabel] = useState('');
  const [creditDays, setCreditDays] = useState(0);
  const [graceDays, setGraceDays] = useState(0);

  const submit = async () => {
    if (!label.trim()) return;
    const { error } = await create({ code: codeFrom(label), label, creditDays, graceDays });
    push(error ? 'error' : 'success', error ?? 'Payment term added.');
    if (!error) { setLabel(''); setCreditDays(0); setGraceDays(0); }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2">
        <input className="input col-span-2" placeholder="e.g. 90 Days" value={label} onChange={(e) => setLabel(e.target.value)} />
        <input type="number" className="input" placeholder="Credit days" value={creditDays} onChange={(e) => setCreditDays(Number(e.target.value))} />
        <input type="number" className="input" placeholder="Grace days" value={graceDays} onChange={(e) => setGraceDays(Number(e.target.value))} />
      </div>
      <button className="btn-primary" onClick={submit}><Plus size={16} /> Add payment term</button>
      <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
        {terms.map((t) => (
          <div key={t.id} className="flex items-center justify-between px-4 py-2">
            <span>{t.label} — {t.credit_days} credit days, {t.grace_days} grace days {t.is_system && <span className="badge-slate ml-2">System</span>}</span>
            {!t.is_system && <button onClick={() => deactivate(t.id)} className="text-slate-400 hover:text-red-600"><Trash2 size={14} /></button>}
          </div>
        ))}
      </div>
    </div>
  );
}

function SimplePanel({ items, onAdd, onRemove, placeholder }: {
  items: { id: string; label: string; is_system: boolean }[];
  onAdd: (label: string) => Promise<{ error: string | null }>;
  onRemove: (id: string) => Promise<{ error: string | null }>;
  placeholder: string;
}) {
  const { push } = useToast();
  const [value, setValue] = useState('');

  const submit = async () => {
    if (!value.trim()) return;
    const { error } = await onAdd(value.trim());
    push(error ? 'error' : 'success', error ?? 'Added.');
    if (!error) setValue('');
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input className="input" placeholder={placeholder} value={value} onChange={(e) => setValue(e.target.value)} />
        <button className="btn-primary shrink-0" onClick={submit}><Plus size={16} /> Add</button>
      </div>
      <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between px-4 py-2">
            <span>{item.label} {item.is_system && <span className="badge-slate ml-2">System</span>}</span>
            {!item.is_system && <button onClick={() => onRemove(item.id)} className="text-slate-400 hover:text-red-600"><Trash2 size={14} /></button>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CreditSettingsPage() {
  const [tab, setTab] = useState<Tab>('terms');
  const methods = usePaymentMethods();
  const risk = useRiskLevels();

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Credit &amp; Payment Settings</h1>
        <p className="text-sm text-slate-500">Configure payment terms, payment methods, and risk levels — no code changes needed.</p>
      </div>

      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {(['terms', 'methods', 'risk'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`border-b-2 px-4 py-2 text-sm font-medium capitalize ${tab === t ? 'border-brand-700 text-brand-700 dark:text-brand-400' : 'border-transparent text-slate-500'}`}>
            {t === 'terms' ? 'Payment Terms' : t === 'methods' ? 'Payment Methods' : 'Risk Levels'}
          </button>
        ))}
      </div>

      <PermissionGate permission="settings:edit">
        <div className="card p-4">
          {tab === 'terms' && <PaymentTermsPanel />}
          {tab === 'methods' && (
            <SimplePanel items={methods.methods} placeholder="e.g. Installment Plan"
              onAdd={(label) => methods.addCustom(codeFrom(label), label)} onRemove={methods.deactivate} />
          )}
          {tab === 'risk' && (
            <SimplePanel items={risk.levels} placeholder="e.g. Watchlist"
              onAdd={(label) => risk.addCustom(codeFrom(label), label, 5)} onRemove={risk.deactivate} />
          )}
        </div>
      </PermissionGate>
    </div>
  );
}
