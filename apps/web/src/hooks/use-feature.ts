import { useState, useEffect, useCallback } from 'react';
import { staffApi } from '@/lib/api';
import { useStaffAuth } from '@/contexts/staff-auth';
import { FeatureState } from '@schoolops/types';

// ── Types ─────────────────────────────────────────────────────────────────────

type FeatureResult = {
  state: FeatureState;
  isActive: boolean;
  isAvailable: boolean;   // in package but not yet activated
  isUnavailable: boolean; // not in package
  loading: boolean;
};

type SubFeatureResult = {
  enabled: boolean;
  loading: boolean;
};

// ── Caches ────────────────────────────────────────────────────────────────────

const featureCache  = new Map<string, FeatureState>();
const subFeatureCache = new Map<string, boolean>();

// ── useFeature ────────────────────────────────────────────────────────────────

export function useFeature(featureKey: string): FeatureResult {
  const { user } = useStaffAuth();
  const [state, setState]     = useState<FeatureState>(FeatureState.UNAVAILABLE);
  const [loading, setLoading] = useState(true);

  const resolve = useCallback(async () => {
    if (!user) { setLoading(false); return; }

    const key = `${user.schoolId}:${featureKey}`;
    if (featureCache.has(key)) {
      setState(featureCache.get(key)!);
      setLoading(false);
      return;
    }

    try {
      const { state: s } = await staffApi.get<{ state: FeatureState }>(
        `/school/features/${featureKey}/state`,
      );
      featureCache.set(key, s);
      setState(s);
    } catch {
      setState(FeatureState.UNAVAILABLE);
    } finally {
      setLoading(false);
    }
  }, [user, featureKey]);

  useEffect(() => { resolve(); }, [resolve]);

  return {
    state,
    isActive:      state === FeatureState.ACTIVE,
    isAvailable:   state === FeatureState.AVAILABLE,
    isUnavailable: state === FeatureState.UNAVAILABLE,
    loading,
  };
}

// ── useAllFeatures (one request for the whole sidebar) ────────────────────────
// Loads every feature's state in a single call so nav items appear together
// instead of popping in one-by-one as individual /state requests resolve.

const allFeaturesCache = new Map<string, Map<string, FeatureState>>(); // schoolId -> key->state

export function useAllFeatures(): { states: Map<string, FeatureState>; loading: boolean } {
  const { user } = useStaffAuth();
  const [states, setStates]   = useState<Map<string, FeatureState>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) { setLoading(false); return; }

      const cached = allFeaturesCache.get(user.schoolId);
      if (cached) { setStates(cached); setLoading(false); return; }

      setLoading(true);
      try {
        const list = await staffApi.get<{ featureKey: string; state: FeatureState }[]>('/school/features');
        const map = new Map(list.map(f => [f.featureKey, f.state]));
        allFeaturesCache.set(user.schoolId, map);
        // Seed the per-key cache so any useFeature() elsewhere resolves instantly.
        for (const [k, s] of map) featureCache.set(`${user.schoolId}:${k}`, s);
        if (!cancelled) setStates(map);
      } catch {
        if (!cancelled) setStates(new Map());
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  return { states, loading };
}

// ── useSubFeature ─────────────────────────────────────────────────────────────

export function useSubFeature(featureKey: string, subFeatureKey: string): SubFeatureResult {
  const { user } = useStaffAuth();
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  const resolve = useCallback(async () => {
    if (!user) { setLoading(false); return; }

    const key = `${user.schoolId}:${featureKey}:${subFeatureKey}`;
    if (subFeatureCache.has(key)) {
      setEnabled(subFeatureCache.get(key)!);
      setLoading(false);
      return;
    }

    try {
      const { enabled: e } = await staffApi.get<{ enabled: boolean }>(
        `/school/features/${featureKey}/sub-features/${subFeatureKey}`,
      );
      subFeatureCache.set(key, e);
      setEnabled(e);
    } catch {
      setEnabled(false);
    } finally {
      setLoading(false);
    }
  }, [user, featureKey, subFeatureKey]);

  useEffect(() => { resolve(); }, [resolve]);

  return { enabled, loading };
}

// ── Cache management ──────────────────────────────────────────────────────────

export function clearFeatureCache() {
  featureCache.clear();
  subFeatureCache.clear();
}
