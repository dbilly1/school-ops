'use client';

import { ReactNode } from 'react';
import { usePermission } from '@/hooks/use-permission';

type Props = {
  featureKey: string;
  subFeatureKey?: string;
  action: 'VIEW' | 'CREATE' | 'EDIT' | 'DELETE';
  children: ReactNode;
  fallback?: ReactNode;
};

/**
 * Renders children only when the current staff user has the given permission.
 * Shows fallback (default: nothing) while loading or when access is denied.
 */
export function PermissionGate({ featureKey, subFeatureKey, action, children, fallback = null }: Props) {
  const { can, loading } = usePermission({ featureKey, subFeatureKey, action });
  if (loading || !can) return <>{fallback}</>;
  return <>{children}</>;
}
