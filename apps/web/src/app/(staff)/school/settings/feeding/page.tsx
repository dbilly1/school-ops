'use client';

import { useState, useCallback, useEffect } from 'react';
import { staffApi, type ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { SettingsCard, FormField, Input, SaveButton, Alert } from '@/components/ui/settings-card';

type GradeLevel = { id: string; name: string; sequence: number };
type FeedingConfig = {
  id: string;
  rateMode: 'FLAT' | 'PER_CLASS';
  flatRate: number | null;
  effectiveFrom: string;
  classRates: { gradeLevelId: string; dailyRate: number }[];
};

export default function FeedingConfigPage() {
  const fetchConfig = useCallback(() => staffApi.get<FeedingConfig | null>('/school/feeding-config'), []);
  const fetchGrades = useCallback(() => staffApi.get<GradeLevel[]>('/school/grade-structure/grade-levels'), []);

  const { data: config, loading: configLoading, refetch } = useApi(fetchConfig);
  const { data: grades } = useApi(fetchGrades);

  const [rateMode, setRateMode]   = useState<'FLAT' | 'PER_CLASS'>('FLAT');
  const [flatRate, setFlatRate]   = useState('');
  const [classRates, setClassRates] = useState<Record<string, string>>({});
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving]       = useState(false);
  const [alert, setAlert]         = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  // Hydrate from existing config
  useEffect(() => {
    if (!config) return;
    setRateMode(config.rateMode);
    setFlatRate(config.flatRate?.toString() ?? '');
    const rates: Record<string, string> = {};
    config.classRates.forEach(r => { rates[r.gradeLevelId] = r.dailyRate.toString(); });
    setClassRates(rates);
  }, [config]);

  async function save() {
    setAlert(null); setSaving(true);
    try {
      await staffApi.post('/school/feeding-config', {
        rateMode,
        flatRate:     rateMode === 'FLAT' ? parseFloat(flatRate) : null,
        effectiveFrom,
        classRates:   rateMode === 'PER_CLASS'
          ? grades?.map(g => ({ gradeLevelId: g.id, dailyRate: parseFloat(classRates[g.id] ?? '0') })) ?? []
          : [],
      });
      setAlert({ type: 'success', message: 'Feeding configuration saved. New rate takes effect from the specified date.' });
      refetch();
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Failed to save.' });
    } finally {
      setSaving(false);
    }
  }

  if (configLoading) return <div className="h-40 bg-slate-100 rounded-2xl animate-pulse" />;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-bold text-slate-900">Feeding Fees</h2>
        <p className="text-sm text-slate-500 mt-0.5">Daily feeding fee rates. Changing the rate applies from the effective date — past records are not affected.</p>
      </div>

      <SettingsCard title="Rate configuration" footer={<SaveButton loading={saving} onClick={save} />}>
        {alert && <div className="mb-4"><Alert type={alert.type} message={alert.message} /></div>}

        <div className="space-y-5">
          {/* Mode selector */}
          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">Collection mode</p>
            <div className="flex gap-3">
              {(['FLAT', 'PER_CLASS'] as const).map(mode => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setRateMode(mode)}
                  className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition ${rateMode === mode ? 'text-white border-transparent' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                  style={rateMode === mode ? { backgroundColor: 'var(--accent)' } : {}}
                >
                  {mode === 'FLAT' ? 'Flat rate (same for all)' : 'Per grade level'}
                </button>
              ))}
            </div>
          </div>

          {/* Flat rate */}
          {rateMode === 'FLAT' && (
            <FormField label="Daily rate" required>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-500 shrink-0">GHS</span>
                <Input
                  type="number"
                  value={flatRate}
                  onChange={e => setFlatRate(e.target.value)}
                  placeholder="0.00"
                  min={0}
                  step={0.01}
                />
              </div>
            </FormField>
          )}

          {/* Per-class rates */}
          {rateMode === 'PER_CLASS' && (
            <div>
              <p className="text-sm font-medium text-slate-700 mb-3">Daily rates by grade level</p>
              {!grades || grades.length === 0 ? (
                <p className="text-sm text-slate-400">No grade levels configured. Set up grade structure first.</p>
              ) : (
                <div className="space-y-2">
                  {grades.sort((a, b) => a.sequence - b.sequence).map(grade => (
                    <div key={grade.id} className="flex items-center gap-3">
                      <span className="text-sm text-slate-600 w-32 shrink-0">{grade.name}</span>
                      <span className="text-sm text-slate-400 shrink-0">GHS</span>
                      <Input
                        type="number"
                        value={classRates[grade.id] ?? ''}
                        onChange={e => setClassRates(r => ({ ...r, [grade.id]: e.target.value }))}
                        placeholder="0.00"
                        min={0}
                        step={0.01}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Effective from */}
          <FormField label="Effective from" hint="The new rate will apply starting from this date.">
            <Input
              type="date"
              value={effectiveFrom}
              onChange={e => setEffectiveFrom(e.target.value)}
            />
          </FormField>
        </div>
      </SettingsCard>
    </div>
  );
}
