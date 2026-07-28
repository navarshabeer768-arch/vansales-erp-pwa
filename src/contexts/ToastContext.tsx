import { createContext, useCallback, useContext, useState, ReactNode } from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';
import clsx from 'clsx';

type ToastKind = 'success' | 'error' | 'info';
interface Toast { id: number; kind: ToastKind; message: string; }

const ToastContext = createContext<{ push: (kind: ToastKind, message: string) => void } | undefined>(undefined);

let idCounter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = ++idCounter;
    setToasts((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4500);
  }, []);

  const dismiss = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={clsx(
              'flex items-start gap-2 rounded-lg border px-4 py-3 shadow-lg min-w-[280px] max-w-sm text-sm',
              t.kind === 'success' && 'bg-emerald-50 border-emerald-200 text-emerald-800',
              t.kind === 'error' && 'bg-red-50 border-red-200 text-red-800',
              t.kind === 'info' && 'bg-brand-50 border-brand-200 text-brand-800'
            )}
          >
            {t.kind === 'success' && <CheckCircle2 size={18} className="mt-0.5 shrink-0" />}
            {t.kind === 'error' && <XCircle size={18} className="mt-0.5 shrink-0" />}
            {t.kind === 'info' && <Info size={18} className="mt-0.5 shrink-0" />}
            <span className="flex-1">{t.message}</span>
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
