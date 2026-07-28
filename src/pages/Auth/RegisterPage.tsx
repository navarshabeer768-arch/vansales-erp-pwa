import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Truck, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export function RegisterPage() {
  const { signUpCompany, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ companyName: '', fullName: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && isAuthenticated) return <Navigate to="/" replace />;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (!form.companyName.trim() || !form.fullName.trim() || !form.email.trim()) {
      setError('All fields are required.');
      return;
    }

    setSubmitting(true);
    const { error: signUpError } = await signUpCompany({
      companyName: form.companyName.trim(),
      slug: `${slugify(form.companyName)}-${Date.now().toString(36)}`,
      fullName: form.fullName.trim(),
      email: form.email.trim(),
      password: form.password,
    });
    setSubmitting(false);

    if (signUpError) setError(signUpError);
    else navigate('/');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4 py-10 dark:bg-surface-dark">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-700 text-white">
            <Truck size={24} />
          </div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Create your workspace</h1>
          <p className="text-center text-sm text-slate-500">You'll be the Company Admin for this account</p>
        </div>

        <form onSubmit={onSubmit} className="card space-y-4 p-6">
          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}
          <div>
            <label className="label" htmlFor="companyName">Company name</label>
            <input
              id="companyName" className="input" value={form.companyName}
              onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))} required
            />
          </div>
          <div>
            <label className="label" htmlFor="fullName">Your full name</label>
            <input
              id="fullName" className="input" value={form.fullName}
              onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} required
            />
          </div>
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input
              id="email" type="email" className="input" value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required
            />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input
              id="password" type="password" className="input" value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} required minLength={8}
            />
          </div>
          <button type="submit" className="btn-primary w-full" disabled={submitting}>
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
