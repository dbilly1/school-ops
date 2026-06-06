'use client';

import { useState, useCallback } from 'react';
import { staffApi, type ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { SaveButton, Alert } from '@/components/ui/settings-card';

// ── Types ─────────────────────────────────────────────────────────────────────

type AcademicYear = { id: string; name: string; isActive: boolean };

type ProgressionOutcome = 'PROMOTE' | 'REPEAT' | 'SKIP';

type PreviewEntry = {
  student: { id: string; studentId: string; firstName: string; lastName: string };
  fromClass: { id: string; name: string; gradeLevel: { name: string; sequence: number } };
  toClass: { id: string; name: string; gradeLevel: { name: string } } | null;
  defaultOutcome: ProgressionOutcome;
};

const OUTCOME_CONFIG: Record<ProgressionOutcome, { label: string; color: string; bg: string; description: string }> = {
  PROMOTE: { label: 'Promote',  color: '#22c55e', bg: '#f0fdf4', description: 'Move to next grade level' },
  REPEAT:  { label: 'Repeat',   color: '#f59e0b', bg: '#fffbeb', description: 'Stay in same grade level' },
  SKIP:    { label: 'Skip',     color: '#8b5cf6', bg: '#f5f3ff', description: 'Advance two grade levels' },
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProgressionPage() {
  const fetchYears = useCallback(() => staffApi.get<AcademicYear[]>('/school/academic-years'), []);
  const { data: years } = useApi(fetchYears);

  const activeYear = years?.find(y => y.isActive);
  const [fromYearId, setFromYearId] = useState('');
  const [toYearId, setToYearId]     = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [executing, setExecuting]   = useState(false);
  const [preview, setPreview]       = useState<PreviewEntry[] | null>(null);
  const [overrides, setOverrides]   = useState<Record<string, ProgressionOutcome>>({});
  const [alert, setAlert]           = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  const currentFromId = fromYearId || activeYear?.id || '';
  const otherYears    = years?.filter(y => y.id !== currentFromId) ?? [];

  async function loadPreview() {
    if (!currentFromId || !toYearId) return;
    setPreviewing(true);
    setAlert(null);
    try {
      const data = await staffApi.get<PreviewEntry[]>(
        `/school/progression/preview?fromYearId=${currentFromId}&toYearId=${toYearId}`,
      );
      setPreview(data);
      setOverrides({});
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Failed to load preview.' });
    } finally {
      setPreviewing(false);
    }
  }

  function setOutcome(studentId: string, outcome: ProgressionOutcome) {
    setOverrides(o => ({ ...o, [studentId]: outcome }));
  }

  function getOutcome(entry: PreviewEntry): ProgressionOutcome {
    return overrides[entry.student.id] ?? entry.defaultOutcome;
  }

  async function execute() {
    if (!preview || !currentFromId || !toYearId) return;
    if (!confirm(`This will create class assignments for ${preview.length} students in the new academic year. Continue?`)) return;
    setExecuting(true); setAlert(null);
    try {
      const decisions = preview.map(entry => ({
        studentId: entry.student.id,
        outcome:   getOutcome(entry),
      }));
      await staffApi.post('/school/progression/execute', {
        fromYearId: currentFromId,
        toYearId,
        decisions,
      });
      setAlert({ type: 'success', message: `${preview.length} students progressed to ${years?.find(y => y.id === toYearId)?.name}.` });
      setPreview(null);
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Failed to execute progression.' });
    } finally {
      setExecuting(false);
    }
  }

  // Summaries
  const promotedCount = preview?.filter(e => getOutcome(e) === 'PROMOTE').length ?? 0;
  const repeatedCount = preview?.filter(e => getOutcome(e) === 'REPEAT').length  ?? 0;
  const skippedCount  = preview?.filter(e => getOutcome(e) === 'SKIP').length    ?? 0;

  // Group preview by current class
  const grouped = preview?.reduce<Record<string, PreviewEntry[]>>((acc, e) => {
    const key = e.fromClass.name;
    if (!acc[key]) acc[key] = [];
    acc[key].push(e);
    return acc;
  }, {});

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">Student Progression</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          End-of-year promotion. Preview the default outcomes, adjust any exceptions, then execute.
        </p>
      </div>

      {/* Year selector */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-5 mb-6">
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <p className="text-sm font-medium text-slate-700 mb-1.5">From academic year</p>
            <select value={currentFromId} onChange={e => { setFromYearId(e.target.value); setPreview(null); }}
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 outline-none">
              <option value="">Select year…</option>
              {years?.map(y => <option key={y.id} value={y.id}>{y.name}{y.isActive ? ' (Active)' : ''}</option>)}
            </select>
          </div>
          <div>
            <p className="text-sm font-medium text-slate-700 mb-1.5">To academic year (new)</p>
            <select value={toYearId} onChange={e => { setToYearId(e.target.value); setPreview(null); }}
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 outline-none">
              <option value="">Select year…</option>
              {otherYears.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-400">
            The system will preview the default outcome for each student based on their current grade level.
            You can change individual outcomes before executing.
          </p>
          <button
            onClick={loadPreview}
            disabled={!currentFromId || !toYearId || previewing}
            className="px-5 py-2 rounded-lg text-sm font-semibold text-white transition disabled:opacity-50"
            style={{ backgroundColor: 'var(--accent)' }}
            onMouseEnter={e => !previewing && (e.currentTarget.style.backgroundColor = 'var(--accent-hover)')}
            onMouseLeave={e => !previewing && (e.currentTarget.style.backgroundColor = 'var(--accent)')}
          >
            {previewing ? 'Loading preview…' : 'Preview progression'}
          </button>
        </div>
      </div>

      {alert && <div className="mb-4"><Alert type={alert.type} message={alert.message} /></div>}

      {/* Preview */}
      {preview && (
        <>
          {/* Summary chips */}
          <div className="flex gap-4 mb-5">
            {([
              { outcome: 'PROMOTE' as ProgressionOutcome, count: promotedCount },
              { outcome: 'REPEAT'  as ProgressionOutcome, count: repeatedCount },
              { outcome: 'SKIP'    as ProgressionOutcome, count: skippedCount  },
            ]).map(chip => {
              const cfg = OUTCOME_CONFIG[chip.outcome];
              return (
              <div key={chip.outcome} className="bg-white rounded-xl border border-slate-100 px-5 py-3 text-center">
                <p className="text-xs font-medium" style={{ color: cfg.color }}>{cfg.label}</p>
                <p className="text-2xl font-bold text-slate-800">{chip.count}</p>
              </div>
            );
            })}
            <div className="bg-white rounded-xl border border-slate-100 px-5 py-3 text-center">
              <p className="text-xs text-slate-400">Total</p>
              <p className="text-2xl font-bold text-slate-800">{preview.length}</p>
            </div>
          </div>

          {/* Per-class tables */}
          {grouped && Object.entries(grouped)
            .sort((a,b) => {
              const aSeq = a[1][0]?.fromClass.gradeLevel.sequence ?? 0;
              const bSeq = b[1][0]?.fromClass.gradeLevel.sequence ?? 0;
              return aSeq - bSeq;
            })
            .map(([className, entries]) => (
              <div key={className} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-4">
                <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <span className="text-sm font-semibold text-slate-800">{className}</span>
                    <span className="text-xs text-slate-400 ml-2">→ {entries[0]?.toClass?.name ?? 'No target class'}</span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => entries.forEach(e => setOutcome(e.student.id, 'PROMOTE'))}
                      className="text-xs font-medium px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition">
                      All promote
                    </button>
                    <button onClick={() => entries.forEach(e => setOutcome(e.student.id, 'REPEAT'))}
                      className="text-xs font-medium px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 transition">
                      All repeat
                    </button>
                  </div>
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-50">
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Student</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Outcome</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map(entry => {
                      const outcome = getOutcome(entry);
                      const cfg     = OUTCOME_CONFIG[outcome];
                      return (
                        <tr key={entry.student.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/40 transition">
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-slate-800">
                              {entry.student.lastName}, {entry.student.firstName}
                            </p>
                            <p className="text-xs font-mono text-slate-400">{entry.student.studentId}</p>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              {(['PROMOTE', 'REPEAT', 'SKIP'] as ProgressionOutcome[]).map(o => {
                                const c = OUTCOME_CONFIG[o];
                                return (
                                  <button key={o} onClick={() => setOutcome(entry.student.id, o)}
                                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition"
                                    style={outcome === o
                                      ? { backgroundColor: c.color, color: '#fff' }
                                      : { backgroundColor: '#f8fafc', color: '#94a3b8' }}>
                                    {c.label}
                                  </button>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}

          {/* Execute */}
          <div className="flex items-center justify-between mt-4 bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-4">
            <div>
              <p className="text-sm font-semibold text-slate-800">Ready to execute?</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {promotedCount} promoted · {repeatedCount} repeated · {skippedCount} skipped.
                Previous class assignments are kept as history.
              </p>
            </div>
            <button
              onClick={execute}
              disabled={executing}
              className="px-6 py-2.5 rounded-lg text-sm font-semibold text-white transition disabled:opacity-50"
              style={{ backgroundColor: 'var(--accent)' }}
              onMouseEnter={e => !executing && (e.currentTarget.style.backgroundColor = 'var(--accent-hover)')}
              onMouseLeave={e => !executing && (e.currentTarget.style.backgroundColor = 'var(--accent)')}
            >
              {executing ? 'Executing…' : 'Execute progression'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
