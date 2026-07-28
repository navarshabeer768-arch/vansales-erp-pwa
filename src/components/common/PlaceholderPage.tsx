import { Construction } from 'lucide-react';

export function PlaceholderPage({ title, phaseNote }: { title: string; phaseNote?: string }) {
  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400">
        <Construction size={28} />
      </div>
      <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{title}</h1>
      <p className="max-w-sm text-sm text-slate-500">
        {phaseNote ?? 'This module is scheduled for a later build phase, once the foundation and Inventory/Warehouse module are confirmed working.'}
      </p>
    </div>
  );
}
