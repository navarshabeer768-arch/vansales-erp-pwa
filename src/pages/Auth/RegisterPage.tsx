import { useState, useEffect } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Truck, Loader2, Building2, User, CheckCircle2, Lock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

const CURRENCIES = ['QAR', 'AED', 'SAR', 'USD', 'EUR', 'GBP', 'INR', 'PKR'];

interface FormState {
  companyName: string;
  companyPhone: string;
  companyAddress: string;
  currency: string;
  taxNumber: string;
  fullName: string;
  username: string;
  adminPhone: string;
  email: string;
  password: string;
  confirmPassword: string;
}

const initialForm: FormState = {
  companyName: '', companyPhone: '', companyAddress: '', currency: 'QAR', taxNumber: '',
  fullName: '', username: '', adminPhone: '', email: '', password: '', confirmPassword: '',
};

export function RegisterPage() {
  const { signUpCompany, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(initialForm);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [needsEmailConfirm, setNeedsEmailConfirm] = useState(false);
  const [registrationClosed, setRegistrationClosed] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.rpc('platform_has_admin').then(({ data }) => setRegistrationClosed(data === true));
  }, []);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  if (!loading && isAuthenticated) return <Navigate to="/" replace />;

  if (registrationClosed === null) return null;

  if (registrationClosed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface px-4 dark:bg-surface-dark">
        <div className="card w-full max-w-sm p-6 text-center">
          <Lock className="mx-auto mb-3 text-slate-400" size={36} />
          <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Registration is closed</h1>
          <p className="mt-2 text-sm text-slate-500">
            New companies are set up directly by the platform team. If you're expecting access,
            reach out to whoever invited you.
          </p>
          <Link to="/login" className="btn-primary mt-5 inline-flex">Go to sign in</Link>
        </div>
      </div>
    );
  }

  if (needsEmailConfirm) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface px-4 dark:bg-surface-dark">
        <div className="card w-full max-w-sm p-6 text-center">
          <CheckCircle2 className="mx-auto mb-3 text-emerald-600" size={40} />
          <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Check your email</h1>
          <p className="mt-2 text-sm text-slate-500">
            We've created <strong>{form.companyName}</strong> and sent a confirmation link to{' '}
            <strong>{form.email}</strong>. Confirm it, then sign in.
          </p>
          <Link to="/login" className="btn-primary mt-5 inline-flex">Go to sign in</Link>
        </div>
      </div>
    );
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.companyName.trim() || !form.fullName.trim() || !form.username.trim() || !form.email.trim()) {
      setError('Company name, your name, username, and email are required.');
      return;
    }
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(form.username.trim())) {
      setError('Username must be 3-30 characters: letters, numbers, and underscores only.');
      return;
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    const { error: signUpError } = await signUpCompany({
      companyName: form.companyName.trim(),
      slug: `${slugify(form.companyName)}-${Date.now().toString(36)}`,
      fullName: form.fullName.trim(),
      username: form.username.trim(),
      email: form.email.trim(),
      password: form.password,
      companyPhone: form.companyPhone.trim() || undefined,
      companyAddress: form.companyAddress.trim() || undefined,
      currency: form.currency,
      taxNumber: form.taxNumber.trim() || undefined,
      adminPhone: form.adminPhone.trim() || undefined,
    });
    setSubmitting(false);

    if (signUpError) { setError(signUpError); return; }

    // If email confirmation is required, signUp won't return an active session —
    // the company/user rows are created either way, but we can't drop them
    // straight into the app until they confirm.
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      setNeedsEmailConfirm(true);
      return;
    }
    navigate('/');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4 py-10 dark:bg-surface-dark">
      <div className="w-full max-w-2xl">
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-700 text-white">
            <Truck size={24} />
          </div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Set up your workspace</h1>
          <p className="text-center text-sm text-slate-500">
            Create your company and admin account in one step — no setup calls, no waiting.
          </p>
        </div>

        <form onSubmit={onSubmit} className="card space-y-6 p-6">
          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}

          <fieldset className="space-y-4">
            <legend className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
              <Building2 size={16} /> Company details
            </legend>
            <div>
              <label className="label" htmlFor="companyName">Company name *</label>
              <input id="companyName" className="input" value={form.companyName}
                onChange={(e) => set('companyName', e.target.value)} required />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="companyPhone">Company phone</label>
                <input id="companyPhone" className="input" value={form.companyPhone}
                  onChange={(e) => set('companyPhone', e.target.value)} placeholder="+974 ..." />
              </div>
              <div>
                <label className="label" htmlFor="currency">Currency</label>
                <select id="currency" className="input" value={form.currency} onChange={(e) => set('currency', e.target.value)}>
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="label" htmlFor="companyAddress">Address</label>
              <input id="companyAddress" className="input" value={form.companyAddress}
                onChange={(e) => set('companyAddress', e.target.value)} placeholder="Warehouse or head office address" />
            </div>
            <div>
              <label className="label" htmlFor="taxNumber">Tax / VAT number</label>
              <input id="taxNumber" className="input" value={form.taxNumber}
                onChange={(e) => set('taxNumber', e.target.value)} placeholder="Optional — add later in Settings if unsure" />
            </div>
          </fieldset>

          <fieldset className="space-y-4 border-t border-slate-200 pt-5 dark:border-slate-700">
            <legend className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
              <User size={16} /> Your admin account
            </legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="fullName">Full name *</label>
                <input id="fullName" className="input" value={form.fullName}
                  onChange={(e) => set('fullName', e.target.value)} required />
              </div>
              <div>
                <label className="label" htmlFor="username">Username *</label>
                <input id="username" className="input" value={form.username}
                  onChange={(e) => set('username', e.target.value)} required placeholder="What you'll log in with" />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="adminPhone">Your phone</label>
              <input id="adminPhone" className="input" value={form.adminPhone}
                onChange={(e) => set('adminPhone', e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="email">Email *</label>
              <input id="email" type="email" className="input" value={form.email}
                onChange={(e) => set('email', e.target.value)} required />
              <p className="mt-1 text-xs text-slate-400">For account recovery — you'll log in with your username, not this.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="password">Password *</label>
                <input id="password" type="password" className="input" value={form.password}
                  onChange={(e) => set('password', e.target.value)} required minLength={8} />
              </div>
              <div>
                <label className="label" htmlFor="confirmPassword">Confirm password *</label>
                <input id="confirmPassword" type="password" className="input" value={form.confirmPassword}
                  onChange={(e) => set('confirmPassword', e.target.value)} required minLength={8} />
              </div>
            </div>
          </fieldset>

          <button type="submit" className="btn-primary w-full !py-3" disabled={submitting}>
            {submitting && <Loader2 size={16} className="animate-spin" />}
            Create workspace
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-500">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-brand-700 hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
