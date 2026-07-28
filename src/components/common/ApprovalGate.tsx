import { Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { PendingApprovalPage } from '@/pages/Auth/PendingApprovalPage';
import { LoadingScreen } from './LoadingScreen';

export function ApprovalGate() {
  const { company, loading, isPlatformAdmin } = useAuth();

  if (loading) return <LoadingScreen />;
  if (company && !company.is_active && !isPlatformAdmin) return <PendingApprovalPage />;
  return <Outlet />;
}
