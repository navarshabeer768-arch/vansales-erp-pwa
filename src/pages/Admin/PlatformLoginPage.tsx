import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export function PlatformLoginPage() {
  const { isPlatformAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && isPlatformAdmin) return <Navigate to="/platform-admin" replace />;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email || !password) { setError('Enter both email and password.'); return; }

    setSubmitting(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setSubmitting(false);
      setError(signInError.message);
      return;
    }

    // Real auth succeeded, but that alone doesn't make this a platform
    // admin — check the actual flag before letting them anywhere near
    // /platform-admin, and don't leave a non-admin signed in on this screen.
    const { data: isAdmin } = await supabase.rpc('is_platform_admin');
    setSubmitting(false);
    if (isAdmin !== true) {
      await supabase.auth.signOut();
      setError('This account is not a platform admin.');
      return;
    }
    navigate('/platform-admin');
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0b1229] px-4">
      <div
        className="pointer-events-none absolute -top-48 left-1/2 h-[700px] w-[700px] -translate-x-1/2 rounded-full opacity-40"
        style={{ background: 'radial-gradient(ellipse, rgba(59,108,216,.35) 0%, transparent 70%)' }}
      />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500 text-[#0b1229] shadow-lg shadow-amber-500/30">
            <ShieldCheck size={24} />
          </div>
          <div>
            <p className="text-lg font-extrabold tracking-tight text-white">Platform Control</p>
            <p className="text-[11px] uppercase tracking-[0.2em] text-white/40">Van Sales ERP · Owner Console</p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 rounded-2xl bg-white p-8 shadow-2xl">
          <div>
            <h1 className="text-lg font-bold text-slate-800">Platform admin sign in</h1>
            <p className="mt-1 text-sm text-slate-500">This is separate from company logins — for platform owners only.</p>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}

          <div>
            <label className="label" htmlFor="pa-email">Email</label>
            <input
              id="pa-email" type="email" className="input" autoComplete="email"
              value={email} onChange={(e) => setEmail(e.target.value)} required
            />
          </div>
          <div>
            <label className="label" htmlFor="pa-password">Password</label>
            <input
              id="pa-password" type="password" className="input" autoComplete="current-password"
              value={password} onChange={(e) => setPassword(e.target.value)} required
            />
          </div>

          <button type="submit" className="btn-primary w-full !py-3" disabled={submitting}>
            {submitting && <Loader2 size={16} className="animate-spin" />}
            Sign in
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-white/30">
          Looking for a company account? That's a different sign-in page.
        </p>
      </div>
    </div>
  );
}
