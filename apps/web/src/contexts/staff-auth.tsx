'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { staffApi, publicPost, storeTokens, clearTokens, getTokens } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

export type StaffUser = {
  id: string;
  schoolId: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: string[];
  onboardingComplete: boolean;
};

export type SchoolBranding = {
  name: string;
  primaryColor: string | null;
  logoUrl: string | null;
};

type StaffAuthState = {
  user: StaffUser | null;
  branding: SchoolBranding | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshBranding: () => Promise<void>;
  markOnboardingComplete: () => void;
  isOwner: boolean;
  isAdmin: boolean;
  hasRole: (role: string) => boolean;
};

// ── Storage helpers ───────────────────────────────────────────────────────────

const STAFF_USER_KEY     = 'so_staff_user';
const STAFF_BRANDING_KEY = 'so_staff_branding';

function readStored<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeStored<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

function clearStored(...keys: string[]) {
  keys.forEach(k => localStorage.removeItem(k));
}

// ── Context ───────────────────────────────────────────────────────────────────

const StaffAuthContext = createContext<StaffAuthState | null>(null);

export function StaffAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]         = useState<StaffUser | null>(null);
  const [branding, setBranding] = useState<SchoolBranding | null>(null);
  const [loading, setLoading]   = useState(true);

  const fetchBranding = useCallback(async () => {
    try {
      const profile = await staffApi.get<SchoolBranding>('/school/profile');
      setBranding(profile);
      writeStored(STAFF_BRANDING_KEY, profile);
    } catch {
      // Non-fatal — branding falls back to platform defaults
    }
  }, []);

  useEffect(() => {
    const { accessToken } = getTokens('staff');

    if (!accessToken) {
      setLoading(false);
      return;
    }

    const storedUser     = readStored<StaffUser>(STAFF_USER_KEY);
    const storedBranding = readStored<SchoolBranding>(STAFF_BRANDING_KEY);
    if (storedUser) {
      setUser(storedUser);
      if (storedBranding) setBranding(storedBranding);
      setLoading(false);
    }

    staffApi.get<StaffUser>('/auth/me')
      .then(async me => {
        setUser(me);
        writeStored(STAFF_USER_KEY, me);
        await fetchBranding();
        if (!storedUser) setLoading(false);
      })
      .catch((err: { status?: number }) => {
        if (err?.status === 401 || err?.status === 403) {
          clearTokens('staff');
          clearStored(STAFF_USER_KEY, STAFF_BRANDING_KEY);
          setUser(null);
          setBranding(null);
        }
        if (!storedUser) setLoading(false);
      });
  }, [fetchBranding]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await publicPost<{ accessToken: string; refreshToken: string; user: StaffUser }>(
      '/auth/login',
      { email, password },
    );
    storeTokens('staff', data.accessToken, data.refreshToken);
    writeStored(STAFF_USER_KEY, data.user);
    setUser(data.user);
    await fetchBranding();
  }, [fetchBranding]);

  const logout = useCallback(async () => {
    const { refreshToken } = getTokens('staff');
    try { await staffApi.post('/auth/logout', { refreshToken }); } catch {}
    clearTokens('staff');
    clearStored(STAFF_USER_KEY, STAFF_BRANDING_KEY);
    setUser(null);
    setBranding(null);
  }, []);

  // Updates both in-memory state and localStorage so the layout guard
  // immediately allows navigation away from onboarding
  const markOnboardingComplete = useCallback(() => {
    setUser(prev => {
      if (!prev) return prev;
      const updated = { ...prev, onboardingComplete: true };
      writeStored(STAFF_USER_KEY, updated);
      return updated;
    });
  }, []);

  const hasRole = useCallback((role: string) => user?.roles.includes(role) ?? false, [user]);
  const isOwner = hasRole('SCHOOL_OWNER');
  const isAdmin = hasRole('SCHOOL_ADMIN');

  return (
    <StaffAuthContext.Provider value={{
      user, branding, loading,
      login, logout, refreshBranding: fetchBranding, markOnboardingComplete,
      isOwner, isAdmin, hasRole,
    }}>
      {children}
    </StaffAuthContext.Provider>
  );
}

export function useStaffAuth() {
  const ctx = useContext(StaffAuthContext);
  if (!ctx) throw new Error('useStaffAuth must be used within StaffAuthProvider');
  return ctx;
}
