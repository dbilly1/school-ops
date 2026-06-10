'use client';

import { useState, useEffect, useCallback } from 'react';
import { staffApi, type ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { SettingsCard, FormField, Input, SaveButton, Alert } from '@/components/ui/settings-card';
import { PasswordInput } from '@/components/ui/password-input';

type Me = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
};

const STAFF_USER_KEY = 'so_staff_user';

export default function AccountPage() {
  const fetchMe = useCallback(() => staffApi.get<Me>('/auth/me'), []);
  const { data: me, loading } = useApi(fetchMe);

  // ── Personal info ──
  const [info, setInfo] = useState({ firstName: '', lastName: '', phone: '' });
  const [infoSaving, setInfoSaving] = useState(false);
  const [infoAlert, setInfoAlert]   = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  useEffect(() => {
    if (me) setInfo({ firstName: me.firstName, lastName: me.lastName, phone: me.phone ?? '' });
  }, [me]);

  async function saveInfo() {
    if (!info.firstName.trim() || !info.lastName.trim()) {
      setInfoAlert({ type: 'error', message: 'First and last name are required.' });
      return;
    }
    setInfoAlert(null); setInfoSaving(true);
    try {
      await staffApi.patch('/auth/me', {
        firstName: info.firstName.trim(),
        lastName:  info.lastName.trim(),
        phone:     info.phone.trim() || null,
      });
      // Keep the cached user (topbar name/initials) in sync; it refreshes fully on next load.
      try {
        const raw = localStorage.getItem(STAFF_USER_KEY);
        if (raw) {
          const u = JSON.parse(raw);
          localStorage.setItem(STAFF_USER_KEY, JSON.stringify({ ...u, firstName: info.firstName.trim(), lastName: info.lastName.trim() }));
        }
      } catch { /* non-fatal */ }
      setInfoAlert({ type: 'success', message: 'Personal details updated.' });
    } catch (err) {
      setInfoAlert({ type: 'error', message: (err as ApiError).message ?? 'Failed to update details.' });
    } finally {
      setInfoSaving(false);
    }
  }

  // ── Password ──
  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' });
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdAlert, setPwdAlert]   = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  async function changePassword() {
    setPwdAlert(null);
    if (pwd.next.length < 6) { setPwdAlert({ type: 'error', message: 'New password must be at least 6 characters.' }); return; }
    if (pwd.next !== pwd.confirm) { setPwdAlert({ type: 'error', message: 'New passwords do not match.' }); return; }
    setPwdSaving(true);
    try {
      await staffApi.post('/auth/change-password', { currentPassword: pwd.current, newPassword: pwd.next });
      setPwd({ current: '', next: '', confirm: '' });
      setPwdAlert({ type: 'success', message: 'Password changed successfully.' });
    } catch (err) {
      setPwdAlert({ type: 'error', message: (err as ApiError).message ?? 'Failed to change password.' });
    } finally {
      setPwdSaving(false);
    }
  }

  const pwdInputCls = 'w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 outline-none transition';

  if (loading) {
    return (
      <div className="max-w-3xl space-y-4">
        <div className="h-40 bg-slate-100 rounded-2xl animate-pulse" />
        <div className="h-56 bg-slate-100 rounded-2xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">My Account</h1>
        <p className="text-sm text-slate-500 mt-0.5">Manage your personal details and password.</p>
      </div>

      {/* Personal information */}
      <SettingsCard
        title="Personal information"
        description="Your name and contact details."
        footer={<SaveButton loading={infoSaving} onClick={saveInfo} label="Save changes" />}
      >
        {infoAlert && <div className="mb-4"><Alert type={infoAlert.type} message={infoAlert.message} /></div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="First name" required>
            <Input value={info.firstName} onChange={e => setInfo(f => ({ ...f, firstName: e.target.value }))} placeholder="First name" />
          </FormField>
          <FormField label="Last name" required>
            <Input value={info.lastName} onChange={e => setInfo(f => ({ ...f, lastName: e.target.value }))} placeholder="Last name" />
          </FormField>
          <FormField label="Email" hint="Your sign-in email can't be changed here — contact an administrator.">
            <Input value={me?.email ?? ''} disabled className="bg-slate-50 text-slate-400 cursor-not-allowed" />
          </FormField>
          <FormField label="Phone">
            <Input value={info.phone} onChange={e => setInfo(f => ({ ...f, phone: e.target.value }))} placeholder="Phone number" />
          </FormField>
        </div>
      </SettingsCard>

      {/* Change password */}
      <SettingsCard
        title="Change password"
        description="Use at least 6 characters."
        footer={
          <SaveButton
            loading={pwdSaving}
            onClick={changePassword}
            label="Update password"
            disabled={!pwd.current || !pwd.next || !pwd.confirm}
          />
        }
      >
        {pwdAlert && <div className="mb-4"><Alert type={pwdAlert.type} message={pwdAlert.message} /></div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
          <FormField label="Current password" required>
            <PasswordInput
              value={pwd.current}
              onChange={e => setPwd(p => ({ ...p, current: e.target.value }))}
              autoComplete="current-password"
              className={pwdInputCls}
              onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
              onBlur={e => e.currentTarget.style.boxShadow = ''}
            />
          </FormField>
          <div className="hidden sm:block" />
          <FormField label="New password" required>
            <PasswordInput
              value={pwd.next}
              onChange={e => setPwd(p => ({ ...p, next: e.target.value }))}
              autoComplete="new-password"
              className={pwdInputCls}
              onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
              onBlur={e => e.currentTarget.style.boxShadow = ''}
            />
          </FormField>
          <FormField label="Confirm new password" required>
            <PasswordInput
              value={pwd.confirm}
              onChange={e => setPwd(p => ({ ...p, confirm: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && changePassword()}
              autoComplete="new-password"
              className={pwdInputCls}
              onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
              onBlur={e => e.currentTarget.style.boxShadow = ''}
            />
          </FormField>
        </div>
      </SettingsCard>
    </div>
  );
}
