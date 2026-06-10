'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePortalAuth } from '@/contexts/portal-auth';
import { portalApi, type ApiError } from '@/lib/api';
import { PasswordInput } from '@/components/ui/password-input';

export default function ChangePasswordPage() {
  const { user, markPasswordChanged } = usePortalAuth();
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword]         = useState('');
  const [confirm, setConfirm]                 = useState('');
  const [saving, setSaving]                   = useState(false);
  const [error, setError]                     = useState<string | null>(null);

  const firstLogin = user?.mustChangePassword ?? false;

  async function submit() {
    setError(null);
    if (newPassword.length < 6) { setError('New password must be at least 6 characters.'); return; }
    if (newPassword !== confirm) { setError('New passwords do not match.'); return; }

    setSaving(true);
    try {
      await portalApi.post('/portal/change-password', { currentPassword, newPassword });
      markPasswordChanged();
      router.replace('/portal/dashboard');
    } catch (err) {
      setError((err as ApiError).message ?? 'Failed to change password.');
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 outline-none';

  return (
    <div className="py-6">
      <div className="mb-6">
        <h1 className="text-lg font-bold text-slate-900">
          {firstLogin ? 'Set your password' : 'Change password'}
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {firstLogin
            ? 'Choose a new password to finish setting up your account.'
            : 'Update your portal password.'}
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
        {error && (
          <div className="px-3.5 py-2.5 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
            {error}
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">
            {firstLogin ? 'Temporary password' : 'Current password'}
          </label>
          <PasswordInput
            value={currentPassword}
            onChange={e => setCurrentPassword(e.target.value)}
            className={inputCls}
            onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
            onBlur={e => e.currentTarget.style.boxShadow = ''}
            autoComplete="current-password"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">New password</label>
          <PasswordInput
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            className={inputCls}
            onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
            onBlur={e => e.currentTarget.style.boxShadow = ''}
            autoComplete="new-password"
          />
          <p className="text-xs text-slate-400 mt-1">At least 6 characters.</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Confirm new password</label>
          <PasswordInput
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            className={inputCls}
            onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
            onBlur={e => e.currentTarget.style.boxShadow = ''}
            autoComplete="new-password"
          />
        </div>

        <button
          onClick={submit}
          disabled={saving || !currentPassword || !newPassword || !confirm}
          className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition disabled:opacity-50"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          {saving ? 'Saving…' : firstLogin ? 'Set password & continue' : 'Update password'}
        </button>
      </div>
    </div>
  );
}
