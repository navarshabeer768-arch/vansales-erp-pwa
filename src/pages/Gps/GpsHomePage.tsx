import { Link, Outlet, useLocation } from 'react-router-dom';
import clsx from 'clsx';

const TABS = [
  { to: '/gps', label: 'Live Tracking', end: true },
  { to: '/gps/history', label: 'History & Playback', end: false },
  { to: '/gps/geofences', label: 'Geofences', end: false },
  { to: '/gps/alerts', label: 'Alerts', end: false },
];

export function GpsHomePage() {
  const location = useLocation();
  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {TABS.map((t) => {
          const active = t.end ? location.pathname === t.to : location.pathname.startsWith(t.to) && t.to !== '/gps';
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
