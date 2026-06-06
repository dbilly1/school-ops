'use client';

import { useState } from 'react';
import { staffApi, type ApiError } from '@/lib/api';
import { WizardShell, WizardNav } from './wizard-shell';

type Term = { name: string; startDate: string; endDate: string };

const currentYear = new Date().getFullYear();
const DEFAULT_YEAR_NAME = `${currentYear}/${currentYear + 1}`;

const DEFAULT_TERMS: Term[] = [
  { name: 'Term 1', startDate: '', endDate: '' },
  { name: 'Term 2', startDate: '', endDate: '' },
  { name: 'Term 3', startDate: '', endDate: '' },
];

export function StepAcademicYear({
  onNext, onBack, onSkip,
}: {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const [yearName, setYearName] = useState(DEFAULT_YEAR_NAME);
  const [terms, setTerms]       = useState<Term[]>(DEFAULT_TERMS);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);

  function updateTerm(i: number, field: keyof Term, value: string) {
    setTerms(t => t.map((term, idx) => idx === i ? { ...term, [field]: value } : term));
  }

  function addTerm() {
    setTerms(t => [...t, { name: `Term ${t.length + 1}`, startDate: '', endDate: '' }]);
  }

  function removeTerm(i: number) {
    if (terms.length <= 1) return;
    setTerms(t => t.filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    if (!yearName.trim()) { setError('Please enter an academic year name.'); return; }

    setError(null);
    setSaving(true);
    try {
      await staffApi.post('/school/academic-years', {
        name: yearName.trim(),
        terms: terms.map((t, i) => ({
          name:      t.name,
          sequence:  i + 1,
          startDate: t.startDate || null,
          endDate:   t.endDate   || null,
        })),
      });
      onNext();
    } catch (err) {
      setError((err as ApiError).message ?? 'Failed to create academic year.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <WizardShell
      title="Set up your academic year"
      description="Create your first academic year and define its terms. Term dates can be filled in later."
      footer={<WizardNav onBack={onBack} onSkip={onSkip} onNext={handleSave} loading={saving} nextLabel="Save & continue" />}
    >
      {/* Year name */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-700 mb-1.5">
          Academic year name
        </label>
        <input
          value={yearName}
          onChange={e => setYearName(e.target.value)}
          placeholder="e.g. 2025/2026"
          className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 outline-none transition"
          onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
          onBlur={e => e.currentTarget.style.boxShadow = ''}
        />
      </div>

      {/* Terms */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm font-medium text-slate-700">Terms</label>
          <button
            type="button"
            onClick={addTerm}
            className="text-xs font-medium transition"
            style={{ color: 'var(--accent)' }}
          >
            + Add term
          </button>
        </div>

        <div className="space-y-3">
          {terms.map((term, i) => (
            <div key={i} className="border border-slate-200 rounded-xl px-4 py-3.5">
              <div className="flex items-center justify-between mb-3">
                <input
                  value={term.name}
                  onChange={e => updateTerm(i, 'name', e.target.value)}
                  className="text-sm font-semibold text-slate-800 border-none outline-none bg-transparent"
                />
                {terms.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeTerm(i)}
                    className="text-slate-300 hover:text-red-400 transition text-lg leading-none"
                  >
                    ×
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Start date</label>
                  <input
                    type="date"
                    value={term.startDate}
                    onChange={e => updateTerm(i, 'startDate', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-700 outline-none transition"
                    onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
                    onBlur={e => e.currentTarget.style.boxShadow = ''}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">End date</label>
                  <input
                    type="date"
                    value={term.endDate}
                    onChange={e => updateTerm(i, 'endDate', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-700 outline-none transition"
                    onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
                    onBlur={e => e.currentTarget.style.boxShadow = ''}
                  />
                </div>
              </div>

              {(!term.startDate || !term.endDate) && (
                <p className="text-xs text-slate-400 mt-2">
                  Dates are optional — you can set them from Settings later.
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
    </WizardShell>
  );
}
