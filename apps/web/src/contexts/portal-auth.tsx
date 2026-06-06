'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { portalApi, publicPost, storeTokens, clearTokens, getTokens } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

export type PortalUser = {
  id: string;
  schoolId: string;
  studentId: string;
  firstName: string;
  lastName: string;
  className: string | null;
  mustChangePassword: boolean;
};

type PortalAuthState = {
  user: PortalUser | null;
  loading: boolean;
  login: (studentId: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

// ── Storage helpers ───────────────────────────────────────────────────────────

const PORTAL_USER_KEY = 'so_portal_user';

function readStoredUser(): PortalUser | null {
  try {
    const raw = localStorage.getItem(PORTAL_USER_KEY);
    return raw ? (JSON.parse(raw) as PortalUser) : null;
  } catch {
    return null;
  }
}

function writeStoredUser(user: PortalUser) {
  localStorage.setItem(PORTAL_USER_KEY, JSON.stringify(user));
}

function clearStoredUser() {
  localStorage.removeItem(PORTAL_USER_KEY);
}

// ── Context ───────────────────────────────────────────────────────────────────

const PortalAuthContext = createContext<PortalAuthState | null>(null);

export function PortalAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<PortalUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { accessToken } = getTokens('portal');

    // No token — resolve immediately
    if (!accessToken) {
      setLoading(false);
      return;
    }

    // Hydrate instantly from localStorage
    const stored = readStoredUser();
    if (stored) {
      setUser(stored);
      setLoading(false);
    }

    // Verify silently in the background
    portalApi.get<PortalUser>('/portal/me')
      .then(me => {
        setUser(me);
        writeStoredUser(me);
        if (!stored) setLoading(false);
      })
      .catch((err: { status?: number }) => {
        if (err?.status === 401 || err?.status === 403) {
          clearTokens('portal');
          clearStoredUser();
          setUser(null);
        }
        if (!stored) setLoading(false);
      });
  }, []);

  const login = useCallback(async (studentId: string, password: string) => {
    const data = await publicPost<{ accessToken: string; refreshToken: string; user: PortalUser }>(
      '/auth/portal/login',
      { studentId, password },
    );
    storeTokens('portal', data.accessToken, data.refreshToken);
    writeStoredUser(data.user);
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    const { refreshToken } = getTokens('portal');
    try { await portalApi.post('/auth/portal/logout', { refreshToken }); } catch {}
    clearTokens('portal');
    clearStoredUser();
    setUser(null);
  }, []);

  return (
    <PortalAuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </PortalAuthContext.Provider>
  );
}

export function usePortalAuth() {
  const ctx = useContext(PortalAuthContext);
  if (!ctx) throw new Error('usePortalAuth must be used within PortalAuthProvider');
  return ctx;
}
