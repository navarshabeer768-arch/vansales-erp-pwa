import { Loader2 } from 'lucide-react';

export function LoadingScreen({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-3 bg-surface dark:bg-surface-dark">
      <Loader2 className="animate-spin text-brand-700" size={32} />
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  );
}
