import { Link, Outlet, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { useAuth } from '@/contexts/AuthContext';

export function SettingsHomePage() {
  const location = useLocation();
  const { can } = useAuth();

  const tabs = [
    { to: '/settings', label: 'Company', end: true, show: true },
    { to: '/settings/security', label: 'Security', end: false, show: true },
    { to: '/settings/roles', label: 'Roles & Permissions', end: false, show: can('settings:edit') },
    { to: '/settings/login-history', label: 'Login History', end: false, show: can('hr:edit') },
    { to: '/settings/devices', label: 'Devices', end: false, show: can('devices:manage') },
    { to: '/settings/print', label: 'Print Settings', end: false, show: can('settings:edit') },
    { to: '/settings/device-reports', label: 'Device & Sync Reports', end: false, show: can('devices:manage') },
  ].filter((t) => t.show);

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {tabs.map((t) => {
          const active = t.end ? location.pathname === t.to : location.pathname.startsWith(t.to) && t.to !== '/settings';
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
