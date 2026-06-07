'use client';

import { useState, useCallback } from 'react';
import { staffApi, type ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { WizardShell, WizardNav } from './wizard-shell';

type GradeLevel = { id: string; name: string; sequence: number };

export function StepFeeding({
  onNext, onBack, onSkip,
}: {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const fetchGrades = useCallback(() => staffApi.get<GradeLevel[]>('/school/grade-structure/grade-levels'), []);
  const { data: grades } = useApi(fetchGrades);

  const [rateMode, setRateMode]   = useState<'FLAT' | 'PER_CLASS'>('FLAT');
  const [flatRate, setFlatRate]   = useState('');
  const [classRates, setClassRates] = useState<Record<string, string>>({});
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);

  async function handleSave() {
    // Validate there's something to save; otherwise nudge to skip.
    if (rateMode === 'FLAT' && !flatRate) {
      setError('Enter a daily rate, or skip this step if you don’t charge feeding fees.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await staffApi.post('/school/feeding-config', {
        rateMode,
        flatRate:   rateMode === 'FLAT' ? parseFloat(flatRate) : null,
        effectiveFrom,
        classRates: rateMode === 'PER_CLASS'
          ? grades?.map(g => ({ gradeLevelId: g.id, dailyRate: parseFloat(classRates[g.id] ?? '0') })) ?? []
          : [],
      });
      onNext();
    } catch (err) {
      setError((err as ApiError).message ?? 'Failed to save feeding configuration.');
    } finally {
      setSaving(false);
    }
  }

  const sortedGrades = (grades ?? []).slice().sort((a, b) => a.sequence - b.sequence);

  return (
    <WizardShell
      title="Set up feeding fees"
      description="Configure daily feeding fee rates. If your school doesn’t charge feeding fees, just skip this step — you can set it up later in Settings."
      footer={<WizardNav onBack={onBack} onSkip={onSkip} onNext={handleSave} loading={saving} nextLabel="Save & continue" />}
    >
      <div className="space-y-5">
        {/* Mode selector */}
        <div>
          <p className="text-sm font-medium text-slate-700 mb-2">Collection mode</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(['FLAT', 'PER_CLASS'] as const).map(mode => (
              <button
                key={mode}
                type="button"
                onClick={() => setRateMode(mode)}
                className={`py-2.5 rounded-xl border text-sm font-medium transition ${rateMode === mode ? 'text-white border-transparent' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                style={rateMode === mode ? { backgroundColor: 'var(--accent)' } : {}}
              >
                {mode === 'FLAT' ? 'Flat rate (same for all)' : 'Per grade level'}
              </button>
            ))}
          </div>
        </div>

        {/* Flat rate */}
        {rateMode === 'FLAT' && (
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Daily rate</label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500 shrink-0">GHS</span>
              <input
                type="number"
                value={flatRate}
                onChange={e => setFlatRate(e.target.value)}
                placeholder="0.00"
                min={0}
                step={0.01}
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 outline-none"
                onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
                onBlur={e => e.currentTarget.style.boxShadow = ''}
              />
            </div>
          </div>
        )}

        {/* Per-class rates */}
        {rateMode === 'PER_CLASS' && (
          <div>
            <p className="text-sm font-medium text-slate-700 mb-3">Daily rates by grade level</p>
            {sortedGrades.length === 0 ? (
              <p className="text-sm text-slate-400">No grade levels configured yet. Set up your grade structure first, or use a flat rate.</p>
            ) : (
              <div className="space-y-2">
                {sortedGrades.map(grade => (
                  <div key={grade.id} className="flex items-center gap-3">
                    <span className="text-sm text-slate-600 w-32 shrink-0">{grade.name}</span>
                    <span className="text-sm text-slate-400 shrink-0">GHS</span>
                    <input
                      type="number"
                      value={classRates[grade.id] ?? ''}
                      onChange={e => setClassRates(r => ({ ...r, [grade.id]: e.target.value }))}
                      placeholder="0.00"
                      min={0}
                      step={0.01}
                      className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 outline-none"
                      onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
                      onBlur={e => e.currentTarget.style.boxShadow = ''}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Effective from */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Effective from</label>
          <input
            type="date"
            value={effectiveFrom}
            onChange={e => setEffectiveFrom(e.target.value)}
            className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 outline-none"
            onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
            onBlur={e => e.currentTarget.style.boxShadow = ''}
          />
          <p className="text-xs text-slate-400 mt-1">The rate applies starting from this date.</p>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    </WizardShell>
  );
}
