'use client';

import { useState, useEffect, useCallback } from 'react';
import { staffApi, type ApiError } from '@/lib/api';
import { useStaffAuth } from '@/contexts/staff-auth';
import { SettingsCard, FormField, Input, SaveButton, Alert } from '@/components/ui/settings-card';

type SchoolProfile = {
  name: string;
  country: string;
  address: string | null;
  phone: string | null;
  primaryColor: string | null;
  logoUrl: string | null;
};

const PRESET_COLORS = [
  '#065f46', '#1e3a5f', '#312e81', '#7c2d12',
  '#831843', '#134e4a', '#1e40af', '#713f12',
];

export default function ProfileSettingsPage() {
  const { branding } = useStaffAuth();

  const [form, setForm] = useState<SchoolProfile>({
    name: '', country: '', address: null, phone: null, primaryColor: null, logoUrl: null,
  });
  const [pageLoading, setPageLoading] = useState(true);
  const [saving, setSaving]           = useState(false);
  const [alert, setAlert]             = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  useEffect(() => {
    staffApi.get<SchoolProfile>('/school/profile')
      .then(data => setForm(data))
      .finally(() => setPageLoading(false));
  }, []);

  function set(field: keyof SchoolProfile) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(f => ({ ...f, [field]: e.target.value || null }));
  }

  function setColor(color: string) {
    setForm(f => ({ ...f, primaryColor: color }));
    document.documentElement.style.setProperty('--accent', color);
  }

  async function handleSave() {
    setAlert(null);
    setSaving(true);
    try {
      await staffApi.patch('/school/profile', {
        name:         form.name,
        country:      form.country,
        address:      form.address,
        phone:        form.phone,
        primaryColor: form.primaryColor,
        logoUrl:      form.logoUrl || undefined,
      });
      setAlert({ type: 'success', message: 'Profile saved successfully.' });
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Failed to save.' });
    } finally {
      setSaving(false);
    }
  }

  if (pageLoading) return <div className="animate-pulse space-y-4"><div className="h-40 bg-slate-100 rounded-2xl" /><div className="h-40 bg-slate-100 rounded-2xl" /></div>;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-bold text-slate-900">Profile & Branding</h2>
        <p className="text-sm text-slate-500 mt-0.5">Your school's identity and contact information.</p>
      </div>

      {/* School info */}
      <SettingsCard
        title="School information"
        footer={<SaveButton loading={saving} onClick={handleSave} />}
      >
        <div className="space-y-4">
          {alert && <Alert type={alert.type} message={alert.message} />}

          <FormField label="School name" required>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="School name" required />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Country" required>
              <Input value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} placeholder="Country" required />
            </FormField>
            <FormField label="Phone">
              <Input value={form.phone ?? ''} onChange={set('phone')} placeholder="+233 20 000 0000" />
            </FormField>
          </div>

          <FormField label="Address">
            <Input value={form.address ?? ''} onChange={set('address')} placeholder="School address" />
          </FormField>
        </div>
      </SettingsCard>

      {/* Branding */}
      <SettingsCard
        title="Branding"
        description="Your brand color is applied across the staff portal. Students and parents will see it too."
      >
        <div className="space-y-6">

          {/* Color picker */}
          <div>
            <p className="text-sm font-medium text-slate-700 mb-3">Brand color</p>
            <div className="flex items-center gap-3 flex-wrap">
              {PRESET_COLORS.map(color => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setColor(color)}
                  className="w-8 h-8 rounded-full border-2 transition-all"
                  style={{
                    backgroundColor: color,
                    borderColor: form.primaryColor === color ? '#fff' : color,
                    boxShadow: form.primaryColor === color ? `0 0 0 3px ${color}` : 'none',
                  }}
                />
              ))}

              {/* Custom hex */}
              <div className="flex items-center gap-2 ml-2">
                <div
                  className="w-7 h-7 rounded-full border border-slate-200 shrink-0"
                  style={{ backgroundColor: form.primaryColor ?? '#065f46' }}
                />
                <input
                  type="text"
                  value={form.primaryColor ?? ''}
                  onChange={e => setColor(e.target.value)}
                  placeholder="#065f46"
                  maxLength={7}
                  className="w-24 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg font-mono text-slate-700 outline-none"
                  onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
                  onBlur={e => e.currentTarget.style.boxShadow = ''}
                />
              </div>
            </div>

            {/* Live preview */}
            <div className="mt-4 p-4 rounded-xl border border-slate-100 bg-slate-50">
              <p className="text-xs text-slate-400 mb-3 uppercase tracking-wide font-medium">Preview</p>
              <div className="flex items-center gap-3">
                <button
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
                  style={{ backgroundColor: form.primaryColor ?? 'var(--accent)' }}
                >
                  Primary button
                </button>
                <span
                  className="text-sm font-medium"
                  style={{ color: form.primaryColor ?? 'var(--accent)' }}
                >
                  Link text
                </span>
                <div
                  className="px-2.5 py-1 rounded-full text-xs font-medium text-white"
                  style={{ backgroundColor: form.primaryColor ?? 'var(--accent)' }}
                >
                  Badge
                </div>
              </div>
            </div>
          </div>

          {/* Logo URL */}
          <FormField
            label="Logo URL"
            hint="Paste a public image URL. Recommended size: 64×64px or larger, square."
          >
            <div className="flex gap-3">
              {form.logoUrl && (
                <img
                  src={form.logoUrl}
                  alt="School logo"
                  className="w-10 h-10 rounded-lg object-cover border border-slate-200 shrink-0"
                />
              )}
              <Input
                value={form.logoUrl ?? ''}
                onChange={set('logoUrl')}
                placeholder="https://example.com/logo.png"
              />
            </div>
          </FormField>

          <div className="flex justify-end">
            <SaveButton loading={saving} onClick={handleSave} />
          </div>
        </div>
      </SettingsCard>
    </div>
  );
}
