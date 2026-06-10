'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { storeTokens, publicPost, type ApiError } from '@/lib/api';
import { PasswordInput } from '@/components/ui/password-input';

export default function StaffLoginPage() {
  const router = useRouter();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const data = await publicPost<{
        accessToken: string; refreshToken: string;
        user: { id: string; schoolId: string; email: string; firstName: string; lastName: string; roles: string[]; onboardingComplete: boolean };
      }>('/auth/login', { email, password });
      storeTokens('staff', data.accessToken, data.refreshToken);
      localStorage.setItem('so_staff_user', JSON.stringify(data.user));
      router.push(data.user.onboardingComplete ? '/school/dashboard' : '/school/onboarding');
    } catch (err) {
      setError((err as ApiError).message ?? 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex">

      {/* ── Left panel — platform brand ── */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12"
        style={{ backgroundColor: 'var(--accent)' }}
      >
        <div>
          {/* Logo mark */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/20 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">S</span>
            </div>
            <span className="text-white font-semibold text-xl tracking-tight">SchoolOps</span>
          </div>
        </div>

        <div>
          <p className="text-white/70 text-sm mb-2 uppercase tracking-widest font-medium">
            School Operations Platform
          </p>
          <h1 className="text-white text-4xl font-bold leading-snug">
            Everything your school needs,<br />in one place.
          </h1>
          <p className="mt-4 text-white/60 text-base max-w-sm">
            Manage staff, students, academics, finance, transport, and parent communication — all from a single platform.
          </p>
        </div>

        <p className="text-white/40 text-xs">
          © {new Date().getFullYear()} SchoolOps. All rights reserved.
        </p>
      </div>

      {/* ── Right panel — login form ── */}
      <div className="flex-1 flex flex-col justify-center items-center px-6 py-12 bg-slate-50">
        <div className="w-full max-w-sm">

          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-10 lg:hidden">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              <span className="text-white font-bold">S</span>
            </div>
            <span className="font-semibold text-slate-800 text-lg">SchoolOps</span>
          </div>

          <h2 className="text-2xl font-bold text-slate-900 mb-1">Welcome back</h2>
          <p className="text-slate-500 text-sm mb-8">Sign in to your school workspace</p>

          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@school.com"
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 outline-none focus:border-transparent focus:ring-2 transition"
                style={{ ['--tw-ring-color' as string]: 'var(--accent)' }}
                onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
                onBlur={e => e.currentTarget.style.boxShadow = ''}
              />
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-slate-700">Password</label>
                <button
                  type="button"
                  className="text-xs font-medium"
                  style={{ color: 'var(--accent)' }}
                >
                  Forgot password?
                </button>
              </div>
              <PasswordInput
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 outline-none transition"
                onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
                onBlur={e => e.currentTarget.style.boxShadow = ''}
              />
            </div>

            {/* Error */}
            {error && (
              <div className="px-3.5 py-2.5 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-60"
              style={{ backgroundColor: loading ? 'var(--accent-hover)' : 'var(--accent)' }}
              onMouseEnter={e => !loading && (e.currentTarget.style.backgroundColor = 'var(--accent-hover)')}
              onMouseLeave={e => !loading && (e.currentTarget.style.backgroundColor = 'var(--accent)')}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-slate-500">
            Is your school not on SchoolOps yet?{' '}
            <a
              href="/register"
              className="font-medium"
              style={{ color: 'var(--accent)' }}
            >
              Register your school
            </a>
          </p>

          {/* Portal link */}
          <div className="mt-6 pt-6 border-t border-slate-200 text-center">
            <p className="text-xs text-slate-400">
              Student or parent?{' '}
              <a href="/portal/login" className="text-slate-500 font-medium hover:text-slate-700 transition">
                Go to student portal →
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
