'use client';

import { ReactNode } from 'react';
import { useFeature, useSubFeature } from '@/hooks/use-feature';

// ── Feature gate ──────────────────────────────────────────────────────────────

type FeatureGateProps = {
  featureKey: string;
  children: ReactNode;
  /**
   * Shown when the feature is in the package but not yet activated.
   * If omitted, AVAILABLE state renders nothing (same as UNAVAILABLE).
   */
  activationPrompt?: ReactNode;
  /** Shown while resolving the feature state. */
  skeleton?: ReactNode;
};

/**
 * Renders children only when the feature is ACTIVE.
 * When AVAILABLE, renders activationPrompt if provided.
 * When UNAVAILABLE or loading without a skeleton, renders nothing.
 */
export function FeatureGate({ featureKey, children, activationPrompt, skeleton }: FeatureGateProps) {
  const { isActive, isAvailable, loading } = useFeature(featureKey);

  if (loading)      return <>{skeleton ?? null}</>;
  if (isActive)     return <>{children}</>;
  if (isAvailable)  return <>{activationPrompt ?? null}</>;
  return null;
}

// ── Sub-feature gate ──────────────────────────────────────────────────────────

type SubFeatureGateProps = {
  featureKey: string;
  subFeatureKey: string;
  children: ReactNode;
  fallback?: ReactNode;
};

/**
 * Renders children only when the sub-feature is enabled within an active feature.
 */
export function SubFeatureGate({ featureKey, subFeatureKey, children, fallback = null }: SubFeatureGateProps) {
  const { enabled, loading } = useSubFeature(featureKey, subFeatureKey);
  if (loading || !enabled) return <>{fallback}</>;
  return <>{children}</>;
}
