import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Building2 } from 'lucide-react';
import { useCompanyProfile } from '@/hooks/useCompanyProfile';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';

const CURRENCIES = ['QAR', 'AED', 'SAR', 'USD', 'EUR', 'GBP', 'INR', 'PKR'];

const schema = z.object({
  name: z.string().min(1, 'Company name is required').max(200),
  legal_name: z.string().max(200).optional().or(z.literal('')),
  phone: z.string().max(30).optional().or(z.literal('')),
  email: z.string().email('Enter a valid email').optional().or(z.literal('')),
  address: z.string().max(300).optional().or(z.literal('')),
  currency: z.string().min(1),
  tax_number: z.string().max(60).optional().or(z.literal('')),
  tax_rate: z.coerce.number().min(0, 'Must be 0 or more').max(100, 'Must be 100 or less'),
});
type FormValues = z.infer<typeof schema>;

export function CompanySettingsPage() {
  const { can } = useAuth();
  const { company, saving, updateProfile } = useCompanyProfile();
  const { push } = useToast();
  const canEdit = can('settings:edit');

  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '', legal_name: '', phone: '', email: '', address: '', currency: 'QAR', tax_number: '', tax_rate: 0,
    },
  });

  useEffect(() => {
    if (company) {
      reset({
        name: company.name, legal_name: company.legal_name ?? '', phone: company.phone ?? '',
        email: company.email ?? '', address: company.address ?? '', currency: company.currency,
        tax_number: company.tax_number ?? '', tax_rate: company.tax_rate,
      });
    }
  }, [company, reset]);

  const submit = async (values: FormValues) => {
    const { error } = await updateProfile({
      name: values.name,
      legal_name: values.legal_name || null,
      phone: values.phone || null,
      email: values.email || null,
      address: values.address || null,
      currency: values.currency,
      tax_number: values.tax_number || null,
      tax_rate: values.tax_rate,
    });
    push(error ? 'error' : 'success', error ?? 'Company profile updated.');
    if (!error) reset(values);
  };

  if (!company) return <p className="py-10 text-center text-slate-400">Loading…</p>;

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-700 text-white">
          <Building2 size={20} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Company Settings</h1>
          <p className="text-sm text-slate-500">Business profile, tax/VAT details, and currency used across invoices and reports.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(submit)} className="card space-y-5 p-6">
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
          <span className="text-slate-500">Store ID: </span>
          <strong>{company.store_id}</strong>
          <span className="ml-2 text-xs text-slate-400">(used with your username to sign in — not editable)</span>
        </div>

        {!canEdit && (
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
            You have view-only access to company settings. Ask a Company Admin to make changes.
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="name">Company name *</label>
            <input id="name" className="input" disabled={!canEdit} {...register('name')} />
            {errors.name && <p className="error-text">{errors.name.message}</p>}
          </div>
          <div>
            <label className="label" htmlFor="legal_name">Legal name</label>
            <input id="legal_name" className="input" disabled={!canEdit} {...register('legal_name')} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="phone">Phone</label>
            <input id="phone" className="input" disabled={!canEdit} {...register('phone')} />
          </div>
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" type="email" className="input" disabled={!canEdit} {...register('email')} />
            {errors.email && <p className="error-text">{errors.email.message}</p>}
          </div>
        </div>

        <div>
          <label className="label" htmlFor="address">Address</label>
          <input id="address" className="input" disabled={!canEdit} {...register('address')} />
        </div>

        <fieldset className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
          <legend className="px-1 text-sm font-medium text-slate-700 dark:text-slate-300">Tax &amp; currency</legend>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="currency">Currency</label>
              <select id="currency" className="input" disabled={!canEdit} {...register('currency')}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="tax_number">Tax / VAT number</label>
              <input id="tax_number" className="input" disabled={!canEdit} {...register('tax_number')} placeholder="e.g. VAT registration number" />
            </div>
            <div>
              <label className="label" htmlFor="tax_rate">Default tax rate (%)</label>
              <input id="tax_rate" type="number" step="0.01" className="input" disabled={!canEdit} {...register('tax_rate')} />
              {errors.tax_rate && <p className="error-text">{errors.tax_rate.message}</p>}
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            This is the company-wide default. Individual products can still override their own tax rate under Inventory.
          </p>
        </fieldset>

        {canEdit && (
          <div className="flex justify-end">
            <button type="submit" className="btn-primary" disabled={saving || !isDirty}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
