import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { LoadingScreen } from './LoadingScreen';

export function PlatformProtectedRoute() {
  const { loading, isAuthenticated, isPlatformAdmin } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!isAuthenticated || !isPlatformAdmin) return <Navigate to="/platform-admin/login" replace />;
  return <Outlet />;
}
