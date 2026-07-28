import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, ShoppingCart, Truck, MapPin, Users, Boxes, Warehouse,
  ShoppingBag, Wallet, HandCoins, Undo2, Calculator, BarChart3, UserCog,
  Radar, Settings, X,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import type { ModuleName } from '@/types/database';
import clsx from 'clsx';

interface NavItem {
  label: string;
  to: string;
  icon: React.ElementType;
  module: ModuleName;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/', icon: LayoutDashboard, module: 'dashboard' },
  { label: 'Sales', to: '/sales', icon: ShoppingCart, module: 'sales' },
  { label: 'Van Loading', to: '/van-loading', icon: Truck, module: 'van_loading' },
  { label: 'Van Unloading', to: '/van-unloading', icon: Truck, module: 'van_unloading' },
  { label: 'Route Planning', to: '/routes', icon: MapPin, module: 'route_planning' },
  { label: 'Customer Visit', to: '/visits', icon: Users, module: 'customer_visit' },
  { label: 'Inventory', to: '/inventory', icon: Boxes, module: 'inventory' },
  { label: 'Warehouse', to: '/warehouse', icon: Warehouse, module: 'warehouse' },
  { label: 'Purchases', to: '/purchases', icon: ShoppingBag, module: 'purchases' },
  { label: 'Payments', to: '/payments', icon: Wallet, module: 'payments' },
  { label: 'Collections', to: '/collections', icon: HandCoins, module: 'collections' },
  { label: 'Returns', to: '/returns', icon: Undo2, module: 'returns' },
  { label: 'Accounting', to: '/accounting', icon: Calculator, module: 'accounting' },
  { label: 'Reports', to: '/reports', icon: BarChart3, module: 'reports' },
  { label: 'HR', to: '/hr', icon: UserCog, module: 'hr' },
  { label: 'GPS Tracking', to: '/gps', icon: Radar, module: 'gps_tracking' },
  { label: 'Settings', to: '/settings', icon: Settings, module: 'settings' },
];

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { can, company } = useAuth();
  const visibleItems = NAV_ITEMS.filter((item) => can(`${item.module}:view`));

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/50 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white',
          'transition-transform duration-200 lg:static lg:translate-x-0 dark:bg-slate-900 dark:border-slate-800',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-4 dark:border-slate-800">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-700 text-sm font-bold text-white">
              {(company?.name ?? 'VS').slice(0, 2).toUpperCase()}
            </div>
            <span className="truncate font-semibold text-slate-800 dark:text-slate-100">
              {company?.name ?? 'Van Sales ERP'}
            </span>
          </div>
          <button className="lg:hidden" onClick={onClose} aria-label="Close menu">
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
          {visibleItems.map(({ label, to, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={onClose}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-brand-50 text-brand-800 dark:bg-brand-900/30 dark:text-brand-300'
                    : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'
                )
              }
            >
              <Icon size={18} className="shrink-0" />
              <span className="truncate">{label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  );
}
