'use client';

import { useState, useCallback, useEffect } from 'react';
import { staffApi, type ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { SettingsCard, FormField, Input, SaveButton, Alert } from '@/components/ui/settings-card';

type GradeLevel = { id: string; name: string; sequence: number };
type Student = { id: string; studentId: string; firstName: string; lastName: string };
type FeedingConfig = {
  id: string;
  rateMode: 'FLAT' | 'PER_CLASS';
  flatRate: number | null;
  effectiveFrom: string;
  optOutAllowed: boolean;
  classRates: { gradeLevelId: string; dailyRate: number }[];
};

// ── Exemption manager (shown when opt-out is enabled) ─────────────────────────

function ExemptManager() {
  const fetchExempt   = useCallback(() => staffApi.get<Student[]>('/school/feeding/exempt'), []);
  const fetchStudents = useCallback(() => staffApi.get<Student[]>('/school/students'), []);
  const { data: exempt, refetch } = useApi(fetchExempt);
  const { data: students } = useApi(fetchStudents);
  const [pick, setPick]   = useState('');
  const [busy, setBusy]   = useState(false);

  const exemptIds = new Set((exempt ?? []).map(s => s.id));
  const selectable = (students ?? []).filter(s => !exemptIds.has(s.id));

  async function exemptStudent() {
    if (!pick) return;
    setBusy(true);
    try { await staffApi.post('/school/feeding/exempt', { studentId: pick }); setPick(''); refetch(); }
    finally { setBusy(false); }
  }
  async function includeStudent(studentId: string) {
    setBusy(true);
    try { await staffApi.post('/school/feeding/include', { studentId }); refetch(); }
    finally { setBusy(false); }
  }

  return (
    <SettingsCard title="Exempt students" >
      <p className="text-sm text-slate-500 mb-4">Exempted students are excluded from feeding collection — they don&apos;t accrue charges or arrears.</p>
      <div className="flex items-center gap-2 mb-4">
        <select value={pick} onChange={e => setPick(e.target.value)}
          className="flex-1 px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 outline-none">
          <option value="">Select a student to exempt…</option>
          {selectable.map(s => <option key={s.id} value={s.id}>{s.lastName}, {s.firstName} ({s.studentId})</option>)}
        </select>
        <button onClick={exemptStudent} disabled={!pick || busy}
          className="px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition disabled:opacity-50"
          style={{ backgroundColor: 'var(--accent)' }}>Exempt</button>
      </div>
      {exempt && exempt.length > 0 ? (
        <ul className="divide-y divide-slate-50 border border-slate-100 rounded-xl">
          {exempt.map(s => (
            <li key={s.id} className="flex items-center justify-between px-4 py-2.5">
              <span className="text-sm text-slate-700">{s.lastName}, {s.firstName}
                <span className="ml-2 text-xs font-mono text-slate-400">{s.studentId}</span></span>
              <button onClick={() => includeStudent(s.id)} disabled={busy}
                className="text-xs font-semibold text-slate-500 hover:text-emerald-600 transition disabled:opacity-50">Re-include</button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-400">No students are exempt.</p>
      )}
    </SettingsCard>
  );
}

export default function FeedingConfigPage() {
  const fetchConfig = useCallback(() => staffApi.get<FeedingConfig | null>('/school/feeding-config'), []);
  const fetchGrades = useCallback(() => staffApi.get<GradeLevel[]>('/school/grade-structure/grade-levels'), []);

  const { data: config, loading: configLoading, refetch } = useApi(fetchConfig);
  const { data: grades } = useApi(fetchGrades);

  const [rateMode, setRateMode]   = useState<'FLAT' | 'PER_CLASS'>('FLAT');
  const [flatRate, setFlatRate]   = useState('');
  const [classRates, setClassRates] = useState<Record<string, string>>({});
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().split('T')[0]);
  const [optOutAllowed, setOptOutAllowed] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [alert, setAlert]         = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  // Hydrate from existing config
  useEffect(() => {
    if (!config) return;
    setRateMode(config.rateMode);
    setFlatRate(config.flatRate?.toString() ?? '');
    setOptOutAllowed(config.optOutAllowed ?? false);
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
        optOutAllowed,
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

          {/* Participation policy */}
          <div className="flex items-start justify-between gap-4 pt-1">
            <div>
              <p className="text-sm font-medium text-slate-700">Allow feeding exemptions</p>
              <p className="text-xs text-slate-500 mt-0.5">By default every student pays feeding. Turn this on to exempt specific students (e.g. those who bring their own food).</p>
            </div>
            <button type="button" role="switch" aria-checked={optOutAllowed}
              onClick={() => setOptOutAllowed(v => !v)}
              className="relative shrink-0 w-11 h-6 rounded-full transition-colors"
              style={{ backgroundColor: optOutAllowed ? 'var(--accent)' : '#cbd5e1' }}>
              <span className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform"
                style={{ transform: optOutAllowed ? 'translateX(20px)' : 'translateX(0)' }} />
            </button>
          </div>

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

      {config?.optOutAllowed && <div className="mt-6"><ExemptManager /></div>}
    </div>
  );
}
