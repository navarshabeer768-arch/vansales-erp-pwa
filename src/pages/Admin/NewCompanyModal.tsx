import { useState } from 'react';
import { Copy, Check as CheckIcon } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useAllCompanies } from '@/hooks/useAllCompanies';
import { useToast } from '@/contexts/ToastContext';

const CURRENCIES = ['QAR', 'AED', 'SAR', 'USD', 'EUR', 'GBP', 'INR', 'PKR'];

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  let pw = '';
  for (let i = 0; i < 12; i++) pw += chars[Math.floor(Math.random() * chars.length)];
  return pw;
}

interface FormState {
  companyName: string; companyPhone: string; companyAddress: string; currency: string; taxNumber: string;
  adminFullName: string; adminUsername: string; adminPhone: string; tempPassword: string;
}

const initialForm: FormState = {
  companyName: '', companyPhone: '', companyAddress: '', currency: 'QAR', taxNumber: '',
  adminFullName: '', adminUsername: '', adminPhone: '', tempPassword: generatePassword(),
};

export function NewCompanyModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { createCompany } = useAllCompanies();
  const { push } = useToast();
  const [form, setForm] = useState<FormState>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<{ username: string; password: string; companyName: string; storeId?: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const reset = () => { setForm({ ...initialForm, tempPassword: generatePassword() }); setCreated(null); };

  const submit = async () => {
    if (!form.companyName.trim() || !form.adminFullName.trim() || !form.adminUsername.trim() || form.tempPassword.length < 8) {
      push('error', 'Company name, admin name, username, and an 8+ character password are required.');
      return;
    }
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(form.adminUsername.trim())) {
      push('error', 'Username must be 3-30 characters: letters, numbers, and underscores only.');
      return;
    }
    setSubmitting(true);
    const result = await createCompany({
      companyName: form.companyName.trim(), companyPhone: form.companyPhone.trim() || undefined,
      companyAddress: form.companyAddress.trim() || undefined, currency: form.currency,
      taxNumber: form.taxNumber.trim() || undefined, adminFullName: form.adminFullName.trim(),
      adminUsername: form.adminUsername.trim(),
      adminPhone: form.adminPhone.trim() || undefined, tempPassword: form.tempPassword,
    });
    setSubmitting(false);
    if (result.error) { push('error', result.error); return; }
    setCreated({
      username: form.adminUsername.trim(), password: form.tempPassword,
      companyName: form.companyName.trim(), storeId: result.storeId,
    });
    onCreated();
  };

  const copyCredentials = async () => {
    if (!created) return;
    await navigator.clipboard.writeText(
      `Store ID: ${created.storeId ?? '—'}\nUsername: ${created.username}\nPassword: ${created.password}`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (created) {
    return (
      <Modal open={open} onClose={() => { reset(); onClose(); }} title="Company created" size="sm">
        <div className="space-y-4 text-center">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            <strong>{created.companyName}</strong> is live and active. Share these login details with them:
          </p>
          <div className="rounded-lg bg-slate-50 p-4 text-left text-sm dark:bg-slate-800">
            <p><span className="text-slate-500">Store ID:</span> <strong>{created.storeId ?? '—'}</strong></p>
            <p><span className="text-slate-500">Username:</span> <strong>{created.username}</strong></p>
            <p><span className="text-slate-500">Password:</span> {created.password}</p>
          </div>
          <p className="text-xs text-amber-600">This password won't be shown again — copy it now.</p>
          <div className="flex justify-center gap-2">
            <button className="btn-secondary" onClick={copyCredentials}>
              {copied ? <CheckIcon size={16} /> : <Copy size={16} />} {copied ? 'Copied' : 'Copy credentials'}
            </button>
            <button className="btn-primary" onClick={() => { reset(); onClose(); }}>Done</button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title="New company" size="lg">
      <div className="space-y-5">
        <fieldset className="space-y-3">
          <legend className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">Company details</legend>
          <div>
            <label className="label">Company name *</label>
            <input className="input" value={form.companyName} onChange={(e) => set('companyName', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Phone</label>
              <input className="input" value={form.companyPhone} onChange={(e) => set('companyPhone', e.target.value)} />
            </div>
            <div>
              <label className="label">Currency</label>
              <select className="input" value={form.currency} onChange={(e) => set('currency', e.target.value)}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Address</label>
            <input className="input" value={form.companyAddress} onChange={(e) => set('companyAddress', e.target.value)} />
          </div>
          <div>
            <label className="label">Tax / VAT number</label>
            <input className="input" value={form.taxNumber} onChange={(e) => set('taxNumber', e.target.value)} />
          </div>
        </fieldset>

        <fieldset className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-700">
          <legend className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">Admin login for this company</legend>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Full name *</label>
              <input className="input" value={form.adminFullName} onChange={(e) => set('adminFullName', e.target.value)} />
            </div>
            <div>
              <label className="label">Username *</label>
              <input className="input" value={form.adminUsername} onChange={(e) => set('adminUsername', e.target.value)} placeholder="What they'll log in with" />
            </div>
          </div>
          <div>
            <label className="label">Phone</label>
            <input className="input" value={form.adminPhone} onChange={(e) => set('adminPhone', e.target.value)} />
          </div>
          <div>
            <label className="label">Temporary password *</label>
            <div className="flex gap-2">
              <input className="input" value={form.tempPassword} onChange={(e) => set('tempPassword', e.target.value)} />
              <button type="button" className="btn-secondary shrink-0" onClick={() => set('tempPassword', generatePassword())}>
                Regenerate
              </button>
            </div>
          </div>
        </fieldset>

        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={() => { reset(); onClose(); }} disabled={submitting}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={submitting}>
            {submitting ? 'Creating…' : 'Create company'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
