'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { publicGet } from '@/lib/api';

export type PortalBranding = {
  name: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
};

type State = PortalBranding & { loading: boolean };

const DEFAULT_ACCENT = '#065f46';

const PortalBrandingContext = createContext<State>({
  name: null, logoUrl: null, primaryColor: null, loading: true,
});

/**
 * Fetches the school's public branding (by subdomain slug) and applies its
 * theme colour to the document so the whole portal — including the pre-auth
 * login page — is branded. Falls back to the platform default on the bare
 * domain or when the school has no custom colour.
 */
export function PortalBrandingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ name: null, logoUrl: null, primaryColor: null, loading: true });

  useEffect(() => {
    let cancelled = false;
    publicGet<PortalBranding | null>('/schools/branding')
      .then(b => { if (!cancelled) setState({ name: b?.name ?? null, logoUrl: b?.logoUrl ?? null, primaryColor: b?.primaryColor ?? null, loading: false }); })
      .catch(() => { if (!cancelled) setState(s => ({ ...s, loading: false })); });
    return () => { cancelled = true; };
  }, []);

  // Apply (or reset) the accent colour whenever branding resolves.
  useEffect(() => {
    const root = document.documentElement;
    const color = state.primaryColor || DEFAULT_ACCENT;
    root.style.setProperty('--accent', color);
    root.style.setProperty('--accent-hover', color);
    root.style.setProperty('--accent-tint', `color-mix(in srgb, ${color} 14%, white)`);
  }, [state.primaryColor]);

  return (
    <PortalBrandingContext.Provider value={state}>
      {children}
    </PortalBrandingContext.Provider>
  );
}

export function usePortalBranding() {
  return useContext(PortalBrandingContext);
}
