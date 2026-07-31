import { Link, Outlet, useLocation } from 'react-router-dom';
import clsx from 'clsx';

const TABS = [
  { to: '/inventory', label: 'Products', end: true },
  { to: '/inventory/catalog', label: 'Catalog settings', end: false },
  { to: '/inventory/serials', label: 'Serial Numbers', end: false },
  { to: '/inventory/labels', label: 'Label Printing', end: false },
  { to: '/inventory/quick-scan', label: 'Quick Scan', end: false },
];

export function InventoryHomePage() {
  const location = useLocation();
  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {TABS.map((t) => {
          const active = t.end ? location.pathname === t.to : location.pathname.startsWith(t.to) && t.to !== '/inventory';
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
