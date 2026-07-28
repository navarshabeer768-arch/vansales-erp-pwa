import { Clock, LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export function PendingApprovalPage() {
  const { company, signOut } = useAuth();

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4 dark:bg-surface-dark">
      <div className="card w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
          <Clock size={28} />
        </div>
        <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
          {company?.name} is awaiting approval
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Your workspace has been created but isn't active yet. Once it's reviewed and approved,
          you'll have full access — no further action is needed on your end.
        </p>
        <button className="btn-secondary mt-6" onClick={signOut}>
          <LogOut size={16} /> Sign out
        </button>
      </div>
    </div>
  );
}
