import { ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export function PermissionGate({ permission, children, fallback = null }: {
  permission: string; children: ReactNode; fallback?: ReactNode;
}) {
  const { can } = useAuth();
  return <>{can(permission) ? children : fallback}</>;
}
