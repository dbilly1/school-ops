'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminAuth } from '@/contexts/admin-auth';
import type { ApiError } from '@/lib/api';

export default function AdminLoginPage() {
  const { login }                 = useAdminAuth();
  const router                    = useRouter();
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [error, setError]         = useState<string | null>(null);
  const [loading, setLoading]     = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      router.push('/admin/dashboard');
    } catch (err) {
      setError((err as ApiError).message ?? 'Login failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-bold">
            S
          </div>
          <span className="text-lg font-bold text-white">SchoolOps</span>
        </div>

        <div className="bg-slate-900 rounded-2xl border border-white/10 px-7 py-8">
          <h2 className="text-xl font-bold text-white mb-1">Super Admin</h2>
          <p className="text-sm text-slate-400 mb-6">Platform administration access only.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 text-sm bg-slate-800 border border-white/10 rounded-lg text-white placeholder-slate-500 outline-none focus:ring-2 focus:ring-emerald-600 transition"
                placeholder="admin@schoolops.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 text-sm bg-slate-800 border border-white/10 rounded-lg text-white placeholder-slate-500 outline-none focus:ring-2 focus:ring-emerald-600 transition"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="px-3.5 py-2.5 rounded-lg bg-red-900/40 border border-red-500/30 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 transition mt-2"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
