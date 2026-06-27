'use client';

import { useState, useEffect } from 'react';
import { staffApi, type ApiError } from '@/lib/api';
import { SettingsCard, SaveButton, Alert } from '@/components/ui/settings-card';

// School-wide policy for how teachers author the body of a lesson note.
type FormatPolicy = 'STRUCTURED_ONLY' | 'RICH_ALLOWED' | 'RICH_ONLY';

const POLICY_OPTIONS: { value: FormatPolicy; label: string; hint: string }[] = [
  { value: 'STRUCTURED_ONLY', label: 'Structured template only', hint: 'Teachers fill the GES template fields (strand, indicators, lesson phases…). This is the default.' },
  { value: 'RICH_ALLOWED',    label: 'Allow rich text',          hint: 'Teachers choose the GES template or a free-form rich-text body for each note.' },
  { value: 'RICH_ONLY',       label: 'Rich text only',           hint: 'Every lesson note is a free-form rich-text body; the structured template is hidden.' },
];

export default function LessonNotesSettingsPage() {
  const [policy, setPolicy]   = useState<FormatPolicy>('STRUCTURED_ONLY');
  const [value, setValue]     = useState<FormatPolicy>('STRUCTURED_ONLY');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [alert, setAlert]     = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  useEffect(() => {
    staffApi.get<{ policy: FormatPolicy }>('/school/lesson-notes/policy')
      .then(d => { setPolicy(d.policy); setValue(d.policy); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setAlert(null); setSaving(true);
    try {
      await staffApi.patch('/school/lesson-notes/policy', { policy: value });
      setPolicy(value);
      setAlert({ type: 'success', message: 'Lesson-note format setting saved.' });
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Failed to save.' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-14 bg-slate-100 rounded-2xl animate-pulse" />)}</div>;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-bold text-slate-900">Lesson Notes</h2>
        <p className="text-sm text-slate-500 mt-0.5">Choose how teachers prepare the body of their weekly lesson notes.</p>
      </div>

      <SettingsCard
        title="Note format"
        description="The class, subject, term and week-ending fields are always required; this setting controls only the note body."
        footer={<SaveButton loading={saving} onClick={save} disabled={value === policy} />}
      >
        {alert && <div className="mb-4"><Alert type={alert.type} message={alert.message} /></div>}
        <div className="space-y-3">
          {POLICY_OPTIONS.map(o => (
            <label
              key={o.value}
              className={`flex items-start gap-3 px-4 py-3 rounded-xl border cursor-pointer transition ${
                value === o.value ? 'border-transparent ring-1' : 'border-slate-200 hover:border-slate-300'
              }`}
              style={value === o.value ? { backgroundColor: 'color-mix(in srgb, var(--accent) 8%, white)', boxShadow: '0 0 0 1px var(--accent) inset' } : {}}
            >
              <input
                type="radio"
                name="ln-policy"
                checked={value === o.value}
                onChange={() => setValue(o.value)}
                className="mt-0.5"
              />
              <span>
                <span className="block text-sm font-medium text-slate-800">{o.label}</span>
                <span className="block text-xs text-slate-400 mt-0.5">{o.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </SettingsCard>
    </div>
  );
}
