'use client';

import { useState } from 'react';
import { staffApi, type ApiError } from '@/lib/api';
import { WizardShell, WizardNav } from './wizard-shell';

// ── Types ─────────────────────────────────────────────────────────────────────

type GradeLevel = { name: string; classes: string[] };

type BasicPrefix = 'Grade' | 'Class' | 'custom';
type JhsStyle   = 'jhs' | 'continue';

// ── Grade list generator ──────────────────────────────────────────────────────

function buildGrades(prefix: string, jhsStyle: JhsStyle): GradeLevel[] {
  const preschool: GradeLevel[] = [
    { name: 'Nursery 1', classes: [] },
    { name: 'Nursery 2', classes: [] },
    { name: 'KG 1',      classes: [] },
    { name: 'KG 2',      classes: [] },
  ];

  const basic: GradeLevel[] = Array.from({ length: 6 }, (_, i) => ({
    name: `${prefix} ${i + 1}`,
    classes: [],
  }));

  const jhs: GradeLevel[] = jhsStyle === 'jhs'
    ? [
        { name: 'JHS 1', classes: [] },
        { name: 'JHS 2', classes: [] },
        { name: 'JHS 3', classes: [] },
      ]
    : Array.from({ length: 3 }, (_, i) => ({
        name: `${prefix} ${i + 7}`,
        classes: [],
      }));

  return [...preschool, ...basic, ...jhs];
}

// ── Component ─────────────────────────────────────────────────────────────────

export function StepGradeStructure({
  onNext, onBack, onSkip,
}: {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const [basicPrefix, setBasicPrefix] = useState<BasicPrefix>('Grade');
  const [customPrefix, setCustomPrefix] = useState('');
  const [jhsStyle, setJhsStyle]         = useState<JhsStyle>('jhs');

  const activePrefix = basicPrefix === 'custom'
    ? (customPrefix.trim() || 'Grade')
    : basicPrefix;

  const [grades, setGrades] = useState<GradeLevel[]>(() =>
    buildGrades('Grade', 'jhs'),
  );

  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  // ── Preference handlers ───────────────────────────────────────────────────

  function applyPrefix(next: BasicPrefix, custom?: string) {
    setBasicPrefix(next);
    const resolved = next === 'custom'
      ? ((custom ?? customPrefix).trim() || 'Grade')
      : next;
    setGrades(buildGrades(resolved, jhsStyle));
  }

  function applyJhsStyle(next: JhsStyle) {
    setJhsStyle(next);
    setGrades(buildGrades(activePrefix, next));
  }

  // ── Row handlers ──────────────────────────────────────────────────────────

  function updateGradeName(i: number, name: string) {
    setGrades(g => g.map((gl, idx) => idx === i ? { ...gl, name } : gl));
  }

  function addClass(i: number) {
    setGrades(g => g.map((gl, idx) => {
      if (idx !== i) return gl;
      const next = String.fromCharCode(65 + gl.classes.length);
      return { ...gl, classes: [...gl.classes, next] };
    }));
  }

  function removeClass(gradeIdx: number, classIdx: number) {
    setGrades(g => g.map((gl, idx) => {
      if (idx !== gradeIdx) return gl;
      return { ...gl, classes: gl.classes.filter((_, ci) => ci !== classIdx) };
    }));
  }

  function addGrade() {
    setGrades(g => [...g, { name: `${activePrefix} ${g.length + 1}`, classes: [] }]);
  }

  function removeGrade(i: number) {
    setGrades(g => g.filter((_, idx) => idx !== i));
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      const levels = grades
        .filter(g => g.name.trim())
        .map((g, i) => ({ name: g.name.trim(), sequence: i + 1, classes: g.classes }));

      await staffApi.post('/school/grade-structure/grade-levels/bulk', { levels });
      onNext();
    } catch (err) {
      setError((err as ApiError).message ?? 'Failed to save grade structure.');
    } finally {
      setSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <WizardShell
      title="Set up your grade structure"
      description="Define your school's grade levels. Each grade is one class by default — add more classes if a grade has multiple streams."
      footer={<WizardNav onBack={onBack} onSkip={onSkip} onNext={handleSave} loading={saving} nextLabel="Save & continue" />}
    >
      {/* ── Naming preferences ── */}
      <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 space-y-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          Naming preferences
        </p>

        {/* Basic school prefix */}
        <div>
          <p className="text-sm font-medium text-slate-700 mb-2">
            What do you call Basic School levels?
          </p>
          <div className="flex flex-wrap gap-2">
            {(['Grade', 'Class'] as const).map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => applyPrefix(opt)}
                className={`px-3.5 py-1.5 rounded-lg text-sm font-medium border transition ${
                  basicPrefix === opt
                    ? 'border-transparent text-white'
                    : 'border-slate-200 text-slate-600 bg-white hover:border-slate-300'
                }`}
                style={basicPrefix === opt ? { backgroundColor: 'var(--accent)' } : {}}
              >
                {opt}
              </button>
            ))}
            <button
              type="button"
              onClick={() => applyPrefix('custom')}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-medium border transition ${
                basicPrefix === 'custom'
                  ? 'border-transparent text-white'
                  : 'border-slate-200 text-slate-600 bg-white hover:border-slate-300'
              }`}
              style={basicPrefix === 'custom' ? { backgroundColor: 'var(--accent)' } : {}}
            >
              Custom
            </button>
            {basicPrefix === 'custom' && (
              <input
                autoFocus
                value={customPrefix}
                onChange={e => {
                  setCustomPrefix(e.target.value);
                  applyPrefix('custom', e.target.value);
                }}
                placeholder="e.g. Form"
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-800 bg-white outline-none focus:border-slate-400 w-28"
              />
            )}
          </div>
        </div>

        {/* JHS naming style */}
        <div>
          <p className="text-sm font-medium text-slate-700 mb-2">
            How do you label Junior High School?
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => applyJhsStyle('jhs')}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-medium border transition ${
                jhsStyle === 'jhs'
                  ? 'border-transparent text-white'
                  : 'border-slate-200 text-slate-600 bg-white hover:border-slate-300'
              }`}
              style={jhsStyle === 'jhs' ? { backgroundColor: 'var(--accent)' } : {}}
            >
              JHS 1, JHS 2, JHS 3
            </button>
            <button
              type="button"
              onClick={() => applyJhsStyle('continue')}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-medium border transition ${
                jhsStyle === 'continue'
                  ? 'border-transparent text-white'
                  : 'border-slate-200 text-slate-600 bg-white hover:border-slate-300'
              }`}
              style={jhsStyle === 'continue' ? { backgroundColor: 'var(--accent)' } : {}}
            >
              Continue numbering ({activePrefix} 7, 8, 9)
            </button>
          </div>
        </div>
      </div>

      {/* ── Grade rows ── */}
      <div className="space-y-3">
        {grades.map((grade, gi) => (
          <div key={gi} className="border border-slate-200 rounded-xl px-4 py-3.5">
            <div className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-semibold text-slate-500 shrink-0">
                {gi + 1}
              </span>

              <input
                value={grade.name}
                onChange={e => updateGradeName(gi, e.target.value)}
                placeholder="e.g. Grade 1"
                className="flex-1 text-sm font-medium text-slate-800 border-none outline-none bg-transparent placeholder-slate-300"
              />

              <button
                type="button"
                onClick={() => removeGrade(gi)}
                className="text-slate-300 hover:text-red-400 transition text-lg leading-none"
              >
                ×
              </button>
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-9">
              {grade.classes.length === 0 && (
                <span className="text-xs text-slate-400 italic">Whole grade is one class</span>
              )}
              {grade.classes.map((cls, ci) => (
                <div key={ci} className="flex items-center gap-1 bg-slate-100 rounded-lg px-2.5 py-1">
                  <span className="text-xs font-medium text-slate-600">{grade.name} {cls}</span>
                  <button
                    type="button"
                    onClick={() => removeClass(gi, ci)}
                    className="text-slate-300 hover:text-red-400 transition text-sm leading-none ml-1"
                  >
                    ×
                  </button>
                </div>
              ))}
              {grade.classes.length < 8 && (
                <button
                  type="button"
                  onClick={() => addClass(gi)}
                  className="text-xs hover:text-slate-600 transition"
                  style={{ color: 'var(--accent)' }}
                >
                  + Add class
                </button>
              )}
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={addGrade}
          className="w-full py-2.5 border border-dashed border-slate-300 rounded-xl text-sm text-slate-400 hover:border-slate-400 hover:text-slate-500 transition"
        >
          + Add grade level
        </button>
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-500">{error}</p>
      )}
    </WizardShell>
  );
}
