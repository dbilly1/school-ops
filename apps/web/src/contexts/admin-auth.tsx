'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { adminApi, publicPost, storeTokens, clearTokens, getTokens } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

export type AdminUser = {
  id: string;
  email: string;
  name: string;
};

type AdminAuthState = {
  admin: AdminUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

// ── Storage helpers ───────────────────────────────────────────────────────────

const ADMIN_USER_KEY = 'so_admin_user';

function readStoredAdmin(): AdminUser | null {
  try {
    const raw = localStorage.getItem(ADMIN_USER_KEY);
    return raw ? (JSON.parse(raw) as AdminUser) : null;
  } catch {
    return null;
  }
}

function writeStoredAdmin(admin: AdminUser) {
  localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(admin));
}

function clearStoredAdmin() {
  localStorage.removeItem(ADMIN_USER_KEY);
}

// ── Context ───────────────────────────────────────────────────────────────────

const AdminAuthContext = createContext<AdminAuthState | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin]     = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { accessToken } = getTokens('admin');

    // No token — resolve immediately; layout will redirect to login
    if (!accessToken) {
      setLoading(false);
      return;
    }

    // Hydrate instantly from localStorage — no blocking network call
    const stored = readStoredAdmin();
    if (stored) {
      setAdmin(stored);
      setLoading(false);
    }

    // Verify silently in the background to catch revoked/expired tokens
    adminApi.get<AdminUser>('/super-admin/auth/me')
      .then(me => {
        setAdmin(me);
        writeStoredAdmin(me);
        if (!stored) setLoading(false);
      })
      .catch((err: { status?: number }) => {
        if (err?.status === 401 || err?.status === 403) {
          clearTokens('admin');
          clearStoredAdmin();
          setAdmin(null);
        }
        if (!stored) setLoading(false);
      });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await publicPost<{ accessToken: string; refreshToken: string; admin: AdminUser }>(
      '/super-admin/auth/login',
      { email, password },
    );
    storeTokens('admin', data.accessToken, data.refreshToken);
    writeStoredAdmin(data.admin);
    setAdmin(data.admin);
  }, []);

  const logout = useCallback(async () => {
    const { refreshToken } = getTokens('admin');
    try { await adminApi.post('/super-admin/auth/logout', { refreshToken }); } catch {}
    clearTokens('admin');
    clearStoredAdmin();
    setAdmin(null);
  }, []);

  return (
    <AdminAuthContext.Provider value={{ admin, loading, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider');
  return ctx;
}
