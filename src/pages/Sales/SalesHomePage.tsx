import { Link, Outlet, useLocation } from 'react-router-dom';
import clsx from 'clsx';

const TABS = [
  { to: '/sales', label: 'New Sale', end: true },
  { to: '/sales/orders', label: 'Orders', end: false },
  { to: '/sales/invoices', label: 'Invoices', end: false },
  { to: '/sales/invoice-reports', label: 'Invoice Reports', end: false },
  { to: '/sales/void-requests', label: 'Void Requests', end: false },
  { to: '/sales/invoice-sync-conflicts', label: 'Invoice Sync Conflicts', end: false },
  { to: '/sales/returns', label: 'Sales Returns', end: false },
  { to: '/sales/return-sync-conflicts', label: 'Return Sync Conflicts', end: false },
  { to: '/sales/return-reports', label: 'Return Reports', end: false },
  { to: '/sales/return-reversal-requests', label: 'Return Reversal Requests', end: false },
  { to: '/sales/approvals', label: 'Approvals', end: false },
  { to: '/sales/sync-conflicts', label: 'Sync Conflicts', end: false },
  { to: '/sales/reports', label: 'Order Reports', end: false },
  { to: '/sales/history', label: 'Sales History', end: false },
];

export function SalesHomePage() {
  const location = useLocation();
  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {TABS.map((t) => {
          const active = t.end ? location.pathname === t.to : location.pathname.startsWith(t.to) && t.to !== '/sales';
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
