import { Link, Outlet, useLocation } from 'react-router-dom';
import clsx from 'clsx';

const TABS = [
  { to: '/accounting', label: 'P&L Summary', end: true },
  { to: '/accounting/expenses', label: 'Expenses', end: false },
  { to: '/accounting/credit-notes', label: 'Credit Notes', end: false },
  { to: '/accounting/debit-notes', label: 'Debit Notes', end: false },
  { to: '/accounting/customer-adjustments', label: 'Customer Adjustments', end: false },
];

export function AccountingHomePage() {
  const location = useLocation();
  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {TABS.map((t) => {
          const active = t.end ? location.pathname === t.to : location.pathname.startsWith(t.to) && t.to !== '/accounting';
          return (
            <Link
              key={t.to}
              to={t.to}
              className={clsx(
                'border-b-2 px-4 py-2 text-sm font-medium',
                active ? 'border-brand-700 text-brand-700 dark:text-brand-400' : 'border-transparent text-slate-500 hover:text-slate-700'
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
      <Outlet />
    </div>
  );
}
