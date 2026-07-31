import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { usePinLockState } from '@/hooks/usePinLockState';
import { PinLockScreen } from '@/components/common/PinLockScreen';

export function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { locked, unlock } = usePinLockState();

  return (
    <div className="flex h-screen overflow-hidden bg-surface dark:bg-surface-dark">
      {locked && <PinLockScreen onUnlock={unlock} />}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
