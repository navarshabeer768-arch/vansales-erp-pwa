import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Building2, Warehouse, Users, ShieldCheck, LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import clsx from 'clsx';

const NAV_ITEMS = [
  { to: '/platform-admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/platform-admin/companies', label: 'Companies', icon: Building2, end: false },
  { to: '/platform-admin/branches', label: 'Branches', icon: Warehouse, end: false },
  { to: '/platform-admin/staff', label: 'Staff Accounts', icon: Users, end: false },
];

export function PlatformAdminLayout() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex h-screen bg-[#f3f5fb]">
      <aside className="flex w-64 flex-col bg-[#0b1229] text-white">
        <div className="flex h-16 items-center gap-2 border-b border-white/10 px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 text-[#0b1229]">
            <ShieldCheck size={18} />
          </div>
          <div>
            <p className="text-sm font-bold leading-tight">Platform Control</p>
            <p className="text-[10px] uppercase tracking-wider text-white/40">Owner Console</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'
                )
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 p-3">
          <button
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/60 hover:bg-white/5 hover:text-white"
            onClick={async () => { await signOut(); navigate('/platform-admin/login'); }}
          >
            <LogOut size={18} /> Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
