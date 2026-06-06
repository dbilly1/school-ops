import { useState, useEffect, useCallback } from 'react';
import { staffApi } from '@/lib/api';
import { useStaffAuth } from '@/contexts/staff-auth';

// ── Types ─────────────────────────────────────────────────────────────────────

type Action = 'VIEW' | 'CREATE' | 'EDIT' | 'DELETE';

type PermissionCheck = {
  featureKey: string;
  subFeatureKey?: string;
  action: Action;
};

type PermissionResult = {
  can: boolean;
  loading: boolean;
};

// ── Cache ─────────────────────────────────────────────────────────────────────
// Keyed by "featureKey:subFeatureKey:action" per user session.
// Cleared on logout via page reload.

const cache = new Map<string, boolean>();

function cacheKey(userId: string, check: PermissionCheck) {
  return `${userId}:${check.featureKey}:${check.subFeatureKey ?? ''}:${check.action}`;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function usePermission(check: PermissionCheck): PermissionResult {
  const { user, isOwner, isAdmin } = useStaffAuth();
  const [can, setCan]         = useState(false);
  const [loading, setLoading] = useState(true);

  const resolve = useCallback(async () => {
    if (!user) { setCan(false); setLoading(false); return; }

    // School Owner and School Admin always have operational access
    if (isOwner || isAdmin) { setCan(true); setLoading(false); return; }

    const key = cacheKey(user.id, check);
    if (cache.has(key)) {
      setCan(cache.get(key)!);
      setLoading(false);
      return;
    }

    try {
      const params = new URLSearchParams({
        featureKey: check.featureKey,
        action: check.action,
        ...(check.subFeatureKey ? { subFeatureKey: check.subFeatureKey } : {}),
      });
      const { can: result } = await staffApi.get<{ can: boolean }>(
        `/school/permissions/check?${params}`,
      );
      cache.set(key, result);
      setCan(result);
    } catch {
      setCan(false);
    } finally {
      setLoading(false);
    }
  }, [user, isOwner, isAdmin, check.featureKey, check.subFeatureKey, check.action]);

  useEffect(() => { resolve(); }, [resolve]);

  return { can, loading };
}

// ── Imperative helper (for non-hook contexts e.g. guards) ─────────────────────

export async function checkPermission(
  userId: string,
  isOwner: boolean,
  isAdmin: boolean,
  check: PermissionCheck,
): Promise<boolean> {
  if (isOwner || isAdmin) return true;

  const key = cacheKey(userId, check);
  if (cache.has(key)) return cache.get(key)!;

  try {
    const params = new URLSearchParams({
      featureKey: check.featureKey,
      action: check.action,
      ...(check.subFeatureKey ? { subFeatureKey: check.subFeatureKey } : {}),
    });
    const { can } = await staffApi.get<{ can: boolean }>(`/school/permissions/check?${params}`);
    cache.set(key, can);
    return can;
  } catch {
    return false;
  }
}

export function clearPermissionCache() {
  cache.clear();
}
