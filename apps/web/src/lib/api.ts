const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

// Root domain schools are served under, e.g. "schoolops.app" → "acme.schoolops.app".
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN;

/**
 * The current school's subdomain slug, sent as the X-School-Slug header so the
 * API can scope login (email/studentId are unique only per school). Returns
 * null on the bare root domain / platform pages.
 */
export function getSchoolSlug(): string | null {
  // Dev override — localhost has no real subdomain.
  if (process.env.NEXT_PUBLIC_DEV_SCHOOL_SLUG) return process.env.NEXT_PUBLIC_DEV_SCHOOL_SLUG;
  if (typeof window === 'undefined') return null;
  const host = window.location.hostname;
  // <slug>.localhost resolves to 127.0.0.1 in Chrome/Firefox for local testing.
  if (host.endsWith('.localhost')) return host.slice(0, -'.localhost'.length) || null;
  if (ROOT_DOMAIN && host.endsWith(`.${ROOT_DOMAIN}`)) {
    return host.slice(0, host.length - ROOT_DOMAIN.length - 1) || null;
  }
  return null;
}

// ── Token storage keys ────────────────────────────────────────────────────────

const KEYS = {
  staff:  { access: 'so_staff_access',  refresh: 'so_staff_refresh'  },
  portal: { access: 'so_portal_access', refresh: 'so_portal_refresh' },
  admin:  { access: 'so_admin_access',  refresh: 'so_admin_refresh'  },
} as const;

export type AuthScope = keyof typeof KEYS;

// ── Storage helpers ───────────────────────────────────────────────────────────

export function getTokens(scope: AuthScope) {
  if (typeof window === 'undefined') return { accessToken: null, refreshToken: null };
  return {
    accessToken:  localStorage.getItem(KEYS[scope].access),
    refreshToken: localStorage.getItem(KEYS[scope].refresh),
  };
}

export function storeTokens(scope: AuthScope, accessToken: string, refreshToken: string) {
  localStorage.setItem(KEYS[scope].access,  accessToken);
  localStorage.setItem(KEYS[scope].refresh, refreshToken);
}

export function clearTokens(scope: AuthScope) {
  localStorage.removeItem(KEYS[scope].access);
  localStorage.removeItem(KEYS[scope].refresh);
}

// ── Refresh endpoint map ──────────────────────────────────────────────────────

const REFRESH_URL: Record<AuthScope, string> = {
  staff:  '/auth/refresh',
  portal: '/auth/portal/refresh',
  admin:  '/super-admin/auth/refresh',
};

// ── In-flight refresh deduplication ──────────────────────────────────────────

const refreshing: Partial<Record<AuthScope, Promise<string | null>>> = {};

async function doRefresh(scope: AuthScope): Promise<string | null> {
  const { refreshToken } = getTokens(scope);
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${API_BASE}${REFRESH_URL[scope]}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) { clearTokens(scope); return null; }
    const data = await res.json();
    storeTokens(scope, data.accessToken, data.refreshToken);
    return data.accessToken;
  } catch {
    clearTokens(scope);
    return null;
  }
}

function refreshOnce(scope: AuthScope): Promise<string | null> {
  if (!refreshing[scope]) {
    refreshing[scope] = doRefresh(scope).finally(() => { delete refreshing[scope]; });
  }
  return refreshing[scope]!;
}

// ── Core fetch wrapper ────────────────────────────────────────────────────────

export type ApiError = {
  status: number;
  message: string;
  errors?: Record<string, string[]>;
};

async function request<T>(
  scope: AuthScope,
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  const { accessToken } = getTokens(scope);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
  const slug = getSchoolSlug();
  if (slug) headers['X-School-Slug'] = slug;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401 && retry) {
    const newToken = await refreshOnce(scope);
    if (newToken) return request<T>(scope, path, options, false);
    clearTokens(scope);
    throw { status: 401, message: 'Session expired' } as ApiError;
  }

  if (!res.ok) {
    let message = 'An error occurred';
    let errors: Record<string, string[]> | undefined;
    try { const b = await res.json(); message = b.message ?? message; errors = b.errors; } catch {}
    throw { status: res.status, message, errors } as ApiError;
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// ── Scoped clients ────────────────────────────────────────────────────────────

function makeClient(scope: AuthScope) {
  return {
    get:    <T>(path: string)                  => request<T>(scope, path, { method: 'GET' }),
    post:   <T>(path: string, body?: unknown)  => request<T>(scope, path, { method: 'POST',   body: JSON.stringify(body) }),
    patch:  <T>(path: string, body?: unknown)  => request<T>(scope, path, { method: 'PATCH',  body: JSON.stringify(body) }),
    put:    <T>(path: string, body?: unknown)  => request<T>(scope, path, { method: 'PUT',    body: JSON.stringify(body) }),
    delete: <T>(path: string)                  => request<T>(scope, path, { method: 'DELETE' }),
  };
}

export const staffApi  = makeClient('staff');
export const portalApi = makeClient('portal');
export const adminApi  = makeClient('admin');

// ── Unauthenticated requests ──────────────────────────────────────────────────

export async function publicPost<T>(path: string, body?: unknown): Promise<T> {
  const slug = getSchoolSlug();
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(slug ? { 'X-School-Slug': slug } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = 'An error occurred';
    try { const b = await res.json(); message = b.message ?? message; } catch {}
    throw { status: res.status, message } as ApiError;
  }
  return res.json();
}

export async function publicGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    let message = 'An error occurred';
    try { const b = await res.json(); message = b.message ?? message; } catch {}
    throw { status: res.status, message } as ApiError;
  }
  return res.json();
}
