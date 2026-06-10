'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { publicPost, storeTokens, type ApiError } from '@/lib/api';
import { PasswordInput } from '@/components/ui/password-input';

export default function PortalLoginPage() {
  const router = useRouter();
  const [studentId, setStudentId] = useState('');
  const [password, setPassword]   = useState('');
  const [error, setError]         = useState<string | null>(null);
  const [loading, setLoading]     = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await publicPost<{ accessToken: string; refreshToken: string }>(
        '/auth/portal/login',
        { studentId, password },
      );
      storeTokens('portal', data.accessToken, data.refreshToken);
      router.push('/portal/dashboard');
    } catch (err) {
      setError((err as ApiError).message ?? 'Login failed. Check your student ID and password.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            S
          </div>
          <span className="text-lg font-bold text-slate-800">SchoolOps</span>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-7 py-8">
          <h2 className="text-xl font-bold text-slate-900 mb-1">Student Portal</h2>
          <p className="text-sm text-slate-500 mb-6">Sign in with your student ID and password.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Student ID</label>
              <input
                value={studentId}
                onChange={e => setStudentId(e.target.value)}
                required
                placeholder="e.g. STU-0001"
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 font-mono placeholder-slate-400 outline-none transition"
                onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
                onBlur={e => e.currentTarget.style.boxShadow = ''}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
              <PasswordInput
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 outline-none transition"
                onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
                onBlur={e => e.currentTarget.style.boxShadow = ''}
              />
            </div>

            {error && (
              <div className="px-3.5 py-2.5 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition disabled:opacity-60 mt-2"
              style={{ backgroundColor: 'var(--accent)' }}
              onMouseEnter={e => !loading && (e.currentTarget.style.backgroundColor = 'var(--accent-hover)')}
              onMouseLeave={e => !loading && (e.currentTarget.style.backgroundColor = 'var(--accent)')}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Staff?{' '}
          <a href="/login" className="font-medium text-slate-500 hover:text-slate-700 transition">
            Go to staff portal →
          </a>
        </p>
      </div>
    </div>
  );
}
