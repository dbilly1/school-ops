'use client';

import { useState, useEffect, useCallback } from 'react';
import { staffApi, type ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { WizardShell, WizardNav } from './wizard-shell';

type StudentIdConfig = { prefix: string | null; suggested: string; hasStudents: boolean };

// Keep in sync with the API's STUDENT_SEQ_PAD.
function previewId(prefix: string) {
  const clean = prefix.trim().toUpperCase() || 'ABC';
  return `${clean}0001`;
}

export function StepStudentId({
  onNext, onBack, onSkip,
}: {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const fetchConfig = useCallback(() => staffApi.get<StudentIdConfig>('/school/profile/settings/student-id'), []);
  const { data: config } = useApi(fetchConfig);

  const [prefix, setPrefix] = useState('');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  // Seed the field with the saved prefix, or the name-derived suggestion.
  useEffect(() => {
    if (config && !touched) setPrefix(config.prefix ?? config.suggested);
  }, [config, touched]);

  const valid = /^[A-Za-z0-9]{2,5}$/.test(prefix.trim());

  async function handleSave() {
    if (!valid) { setError('Prefix must be 2–5 letters or digits.'); return; }
    setError(null);
    setSaving(true);
    try {
      await staffApi.patch('/school/profile/settings/student-id', { prefix: prefix.trim().toUpperCase() });
      onNext();
    } catch (err) {
      setError((err as ApiError).message ?? 'Failed to save student ID prefix.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <WizardShell
      title="Student ID format"
      description="Every student gets a unique ID used on their records and to sign in to the student portal. Pick the prefix it starts with — usually your school's initials."
      footer={<WizardNav onBack={onBack} onSkip={onSkip} onNext={handleSave} loading={saving} nextLabel="Save & continue" nextDisabled={!valid} />}
    >
      <div className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Prefix</label>
          <input
            value={prefix}
            onChange={e => { setTouched(true); setPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5)); }}
            placeholder="e.g. MIS"
            className="w-40 px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 font-mono tracking-wide outline-none"
            onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
            onBlur={e => e.currentTarget.style.boxShadow = ''}
          />
          {config?.suggested && prefix.trim().toUpperCase() !== config.suggested && (
            <button
              type="button"
              onClick={() => { setTouched(true); setPrefix(config.suggested); }}
              className="ml-3 text-xs font-medium transition"
              style={{ color: 'var(--accent)' }}
            >
              Use suggested ({config.suggested})
            </button>
          )}
          <p className="text-xs text-slate-400 mt-1.5">2–5 letters or digits.</p>
        </div>

        {/* Live preview */}
        <div className="p-4 rounded-xl border border-slate-100 bg-slate-50">
          <p className="text-xs text-slate-400 mb-2 uppercase tracking-wide font-medium">First student will be</p>
          <p className="text-lg font-bold font-mono text-slate-800">{previewId(prefix)}</p>
        </div>

        <p className="text-xs text-slate-400">
          You can change this later in Settings. It only affects students added afterwards — existing IDs never change.
        </p>

        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    </WizardShell>
  );
}
