'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { staffApi, type ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import {
  ADMISSION_LETTER_TOKENS,
  DEFAULT_ADMISSION_LETTER_TEMPLATE,
} from '@/lib/admission-letter';

// Editor for the school's admission-letter body. The header, date and signature
// frame are added by the letter document; this is just the body wording, with
// {{merge}} tokens that auto-fill per applicant. Saved on the school profile;
// Owner/Admin only (PATCH /school/profile enforces that server-side too).

type ProfileTemplate = { admissionLetterTemplate: string | null };

const MAX = 8000;

export function AdmissionLetterTemplateCard() {
  const fetchProfile = useCallback(
    () => staffApi.get<ProfileTemplate>('/school/profile'),
    [],
  );
  const { data: profile, loading } = useApi(fetchProfile);

  const [text, setText] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Seed with the school's template, or the default when none is set yet.
  useEffect(() => {
    if (profile && !loaded) {
      setText(profile.admissionLetterTemplate?.trim() || DEFAULT_ADMISSION_LETTER_TEMPLATE);
      setLoaded(true);
    }
  }, [profile, loaded]);

  const dirty = loaded && text.trim() !== (profile?.admissionLetterTemplate?.trim() || DEFAULT_ADMISSION_LETTER_TEMPLATE);

  function insertToken(token: string) {
    const ta = taRef.current;
    if (!ta) { setText(t => t + token); return; }
    const start = ta.selectionStart ?? text.length;
    const end = ta.selectionEnd ?? text.length;
    const next = text.slice(0, start) + token + text.slice(end);
    setText(next.slice(0, MAX));
    // Restore caret just after the inserted token.
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + token.length;
      ta.setSelectionRange(pos, pos);
    });
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      await staffApi.patch('/school/profile', { admissionLetterTemplate: text.trim() });
      setMsg({ ok: true, text: 'Saved.' });
    } catch (err) {
      setMsg({ ok: false, text: (err as ApiError).message ?? 'Failed to save.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-8 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">Admission letter template</h3>
          <p className="text-xs text-slate-400 mt-0.5">The body of the admission letter. Tokens auto-fill per applicant.</p>
        </div>
        <div className="flex items-center gap-3">
          {msg && <span className={`text-xs ${msg.ok ? 'text-green-600' : 'text-red-500'}`}>{msg.text}</span>}
          <button
            onClick={() => setText(DEFAULT_ADMISSION_LETTER_TEMPLATE)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-100 transition"
          >
            Use default
          </button>
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

      <div className="p-5">
        {/* Token reference — click to insert at the cursor */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {ADMISSION_LETTER_TOKENS.map(t => (
            <button
              key={t.token}
              onClick={() => insertToken(t.token)}
              title={t.desc}
              className="px-2 py-1 rounded-md text-[11px] font-mono bg-sky-50 text-sky-700 border border-sky-100 hover:bg-sky-100 transition"
            >
              {t.token}
            </button>
          ))}
        </div>

        {loading && !loaded ? (
          <div className="h-64 bg-slate-100 rounded-lg animate-pulse" />
        ) : (
          <textarea
            ref={taRef}
            value={text}
            onChange={e => setText(e.target.value.slice(0, MAX))}
            rows={16}
            className="w-full px-3.5 py-3 text-sm bg-white border border-slate-200 rounded-lg outline-none resize-y leading-relaxed font-serif focus:border-transparent"
            onFocus={e => (e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)')}
            onBlur={e => (e.currentTarget.style.boxShadow = '')}
          />
        )}
        <p className="mt-1.5 text-[11px] text-slate-400 text-right">{text.length}/{MAX}</p>
        <p className="mt-1 text-[11px] text-slate-400">
          The school letterhead, date and an official footer are added automatically — write only the letter body here.
        </p>
      </div>
    </div>
  );
}
