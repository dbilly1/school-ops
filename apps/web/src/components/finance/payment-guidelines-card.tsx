'use client';

import { useState, useEffect, useCallback } from 'react';
import { staffApi, type ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';

// School-wide payment instructions (bank details, mobile money, deadlines) that
// print on every fee invoice. Stored on the school profile; editable by Owner /
// Admin only (the PATCH /school/profile endpoint enforces that too).

type ProfileGuidelines = { feePaymentGuidelines: string | null };

const MAX = 4000;

export function PaymentGuidelinesCard() {
  const fetchProfile = useCallback(
    () => staffApi.get<ProfileGuidelines>('/school/profile'),
    [],
  );
  const { data: profile, loading } = useApi(fetchProfile);

  const [text, setText] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Seed the textarea once the profile loads.
  useEffect(() => {
    if (profile && !loaded) {
      setText(profile.feePaymentGuidelines ?? '');
      setLoaded(true);
    }
  }, [profile, loaded]);

  const dirty = loaded && text.trim() !== (profile?.feePaymentGuidelines ?? '').trim();

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      await staffApi.patch('/school/profile', { feePaymentGuidelines: text.trim() });
      setMsg({ ok: true, text: 'Saved.' });
    } catch (err) {
      setMsg({ ok: false, text: (err as ApiError).message ?? 'Failed to save.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-6 bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Payment Guidelines</h3>
        <div className="flex items-center gap-3">
          {msg && <span className={`text-xs ${msg.ok ? 'text-green-600' : 'text-red-500'}`}>{msg.text}</span>}
          <button
            onClick={save}
            disabled={saving || !dirty}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition disabled:opacity-40"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
          </button>
        </div>
      </div>
      <div className="p-4">
        <p className="text-xs text-slate-400 mb-3">
          Printed at the bottom of every fee invoice. Add your bank details, mobile-money numbers,
          payment deadlines, or late-payment terms. Leave blank to omit this section from invoices.
        </p>
        {loading && !loaded ? (
          <div className="h-28 bg-slate-100 rounded-lg animate-pulse" />
        ) : (
          <textarea
            value={text}
            onChange={e => setText(e.target.value.slice(0, MAX))}
            rows={6}
            placeholder={
              'e.g.\n• Bank: Ecobank — Acct 1234567890 (School Name)\n• MTN MoMo: 024 000 0000\n• Fees due within two weeks of term start.\n• A 10% surcharge applies to late payments.'
            }
            className="w-full px-3 py-2.5 text-sm bg-white border border-slate-200 rounded-lg outline-none resize-y leading-relaxed focus:border-transparent"
            onFocus={e => (e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)')}
            onBlur={e => (e.currentTarget.style.boxShadow = '')}
          />
        )}
        <p className="mt-1.5 text-[11px] text-slate-400 text-right">{text.length}/{MAX}</p>
      </div>
    </div>
  );
}
