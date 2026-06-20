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

// Resize an image file down to fit `max` px (longest side) and return a PNG
// data URL — keeps the stored logo small and transparency intact.
function resizeImageToDataUrl(file: File, max = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read failed'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('decode failed'));
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('no canvas context'));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export default function ProfileSettingsPage() {
  const { branding, refreshBranding } = useStaffAuth();

  const [form, setForm] = useState<SchoolProfile>({
    name: '', country: '', address: null, phone: null, primaryColor: null, logoUrl: null,
  });
  const [pageLoading, setPageLoading] = useState(true);
  const [saving, setSaving]           = useState(false);
  const [alert, setAlert]             = useState<{ type: 'error' | 'success'; message: string } | null>(null);
  const [logoBusy, setLogoBusy]       = useState(false);
  const [logoError, setLogoError]     = useState<string | null>(null);

  async function handleLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    if (!file.type.startsWith('image/')) { setLogoError('Please choose an image file (PNG or JPG).'); return; }
    if (file.size > 8 * 1024 * 1024) { setLogoError('That image is too large (max 8MB).'); return; }
    setLogoError(null); setLogoBusy(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file, 256);
      setForm(f => ({ ...f, logoUrl: dataUrl }));
    } catch {
      setLogoError('Could not process that image. Try a different file.');
    } finally {
      setLogoBusy(false);
    }
  }

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
        logoUrl:      form.logoUrl, // string data-URL/URL, or null to clear
      });
      // Refresh the cached branding so the sidebar/logo/colour update everywhere.
      await refreshBranding();
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

          {/* Logo upload */}
          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">School logo</p>
            <div className="flex items-center gap-4">
              {form.logoUrl ? (
                <img
                  src={form.logoUrl}
                  alt="School logo"
                  className="w-16 h-16 rounded-lg object-contain border border-slate-200 bg-white shrink-0"
                />
              ) : (
                <div className="w-16 h-16 rounded-lg border border-dashed border-slate-300 flex items-center justify-center text-[10px] text-slate-300 shrink-0">
                  No logo
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-3">
                  <label
                    className="px-3.5 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                  >
                    <input type="file" accept="image/*" className="hidden" onChange={handleLogoFile} disabled={logoBusy} />
                    {logoBusy ? 'Processing…' : form.logoUrl ? 'Replace logo' : 'Upload logo'}
                  </label>
                  {form.logoUrl && (
                    <button
                      type="button"
                      onClick={() => { setForm(f => ({ ...f, logoUrl: null })); setLogoError(null); }}
                      className="text-xs text-red-400 hover:text-red-600 transition"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-400">PNG or JPG. Square works best — auto-resized to 256px. Click Save to apply.</p>
                {logoError && <p className="text-xs text-red-500">{logoError}</p>}
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <SaveButton loading={saving} onClick={handleSave} />
          </div>
        </div>
      </SettingsCard>
    </div>
  );
}
