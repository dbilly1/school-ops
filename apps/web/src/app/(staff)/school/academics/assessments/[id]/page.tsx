'use client';

import { useState, useCallback, use, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { staffApi, type ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { SaveButton, Alert } from '@/components/ui/settings-card';

// ── Types ─────────────────────────────────────────────────────────────────────

type Assessment = {
  id: string;
  title: string;
  totalScore: number;
  weight: number | null;
  category: string;
  assessmentDate: string | null;
  batchId: string | null;
  subject: { id: string; name: string };
  class: { id: string; name: string } | null;
  term: { id: string; name: string };
};

const CATEGORY_LABEL: Record<string, string> = {
  CLASS_EXERCISE: 'Class Exercise', CLASS_TEST: 'Class Test', GROUP_WORK: 'Group Work',
  PROJECT: 'Project Work', HOMEWORK: 'Homework', MID_TERM: 'Mid-Term', END_OF_TERM_EXAM: 'End-of-Term Exam',
};

type ScoreRecord = {
  studentId: string;
  rawScore: number;
  remarks: string | null;
};

type Student = {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  classAssignments: { class: { id: string; name: string } }[];
};

type GradingBand = {
  label: string;
  minScore: number;
  maxScore: number;
  remark: string | null;
};

// ── Derive display grade ──────────────────────────────────────────────────────

function getGradeLabel(score: number, total: number, bands: GradingBand[]): string {
  if (!bands.length) return '';
  const pct = (score / total) * 100;
  const band = bands.find(b => pct >= b.minScore && pct <= b.maxScore);
  return band?.label ?? '';
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ScoreEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router  = useRouter();

  const fetchAssessment = useCallback(() => staffApi.get<Assessment>(`/school/assessments/${id}`), [id]);
  const fetchExisting   = useCallback(() => staffApi.get<ScoreRecord[]>(`/school/assessments/${id}/scores`).catch(() => []), [id]);
  const fetchGrading    = useCallback(() => staffApi.get<{ bands: GradingBand[] } | null>('/school/grading/active').catch(() => null), []);

  const { data: assessment, loading: aLoading }        = useApi(fetchAssessment);
  const { data: existingScores, loading: sLoading }    = useApi(fetchExisting);
  const { data: gradingScale }                         = useApi(fetchGrading);

  // Classes for filtering
  const fetchClasses  = useCallback(() => staffApi.get<{ id: string; name: string }[]>('/school/grade-structure/classes'), []);
  const { data: classes } = useApi(fetchClasses);
  const [selectedClass, setSelectedClass] = useState('');

  // Default to the assessment's own class until the user picks another.
  const effectiveClass = selectedClass || assessment?.class?.id || '';

  // Don't fetch students until the assessment has loaded, so we never request
  // (and briefly flash) the whole school before narrowing to the class. Once
  // loaded: fetch the assessment's class only (or all, for a legacy class-less
  // assessment / explicit "All classes").
  const fetchStudents = useCallback(() => {
    if (!assessment) return Promise.resolve<Student[]>([]);
    return effectiveClass
      ? staffApi.get<Student[]>(`/school/students?classId=${effectiveClass}`)
      : staffApi.get<Student[]>('/school/students');
  }, [assessment, effectiveClass]);
  // Key gates the first real fetch on the assessment being ready, then re-fetches
  // when the chosen class changes.
  const studentsKey = assessment ? (effectiveClass || 'all') : 'pending';
  const { data: students, loading: studLoading } = useApi(fetchStudents, studentsKey);

  // Score state — keyed by studentId. Re-seed (mapping already-recorded scores)
  // once the real roster for the current view has finished loading. We key the
  // guard on studentsKey and skip the 'pending' placeholder + any in-flight
  // refetch, so we never seed against the transient empty roster useApi holds
  // during a key change (which previously stuck the page on blank scores).
  const [scores, setScores] = useState<Record<string, { rawScore: string; remarks: string }>>({});
  const initialisedFor = useRef<string | null>(null);

  if (
    !sLoading && !studLoading && existingScores && students &&
    studentsKey !== 'pending' && initialisedFor.current !== studentsKey
  ) {
    const init: typeof scores = {};
    students.forEach(s => {
      const existing = existingScores.find(e => e.studentId === s.id);
      init[s.id] = {
        rawScore: existing ? String(existing.rawScore) : '',
        remarks:  existing?.remarks ?? '',
      };
    });
    setScores(init);
    initialisedFor.current = studentsKey;
  }

  const [saving, setSaving] = useState(false);
  const [alert, setAlert]   = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  function setScore(studentId: string, field: 'rawScore' | 'remarks', value: string) {
    setScores(s => ({ ...s, [studentId]: { ...(s[studentId] ?? { rawScore: '', remarks: '' }), [field]: value } }));
  }

  async function saveAll() {
    if (!assessment) return;
    setAlert(null); setSaving(true);
    try {
      const entries = Object.entries(scores)
        .filter(([, v]) => v.rawScore !== '')
        .map(([studentId, v]) => ({
          studentId,
          rawScore: parseFloat(v.rawScore),
          remarks:  v.remarks || null,
        }));

      await staffApi.post(`/school/assessments/${id}/scores`, { scores: entries });
      setAlert({ type: 'success', message: `${entries.length} score${entries.length !== 1 ? 's' : ''} saved.` });
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Failed to save scores.' });
    } finally {
      setSaving(false);
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function deleteAssessment() {
    setDeleting(true); setAlert(null);
    try {
      const res = await staffApi.delete<{ batchId: string | null; batchDeleted: boolean }>(`/school/assessments/${id}`);
      // Go back to the parent batch if it still exists, else the main list.
      router.push(res.batchId && !res.batchDeleted
        ? `/school/academics/assessments/batch/${res.batchId}`
        : '/school/academics/assessments');
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Failed to delete assessment.' });
      setDeleting(false);
    }
  }

  const loading = aLoading || sLoading || studLoading;

  if (aLoading) return (
    <div className="space-y-4">
      <div className="h-16 bg-slate-100 rounded-2xl animate-pulse" />
      <div className="h-64 bg-slate-100 rounded-2xl animate-pulse" />
    </div>
  );

  if (!assessment) return <p className="text-sm text-slate-400">Assessment not found.</p>;

  const bands = gradingScale?.bands ?? [];
  const filledCount = Object.values(scores).filter(v => v.rawScore !== '').length;
  const avgScore = filledCount > 0
    ? Math.round(Object.values(scores).filter(v => v.rawScore !== '').reduce((s, v) => s + parseFloat(v.rawScore), 0) / filledCount)
    : null;

  return (
    <div>
      {/* Back + delete */}
      <div className="flex items-center justify-between mb-5">
        <button onClick={() => router.push('/school/academics/assessments')}
          className="text-sm text-slate-400 hover:text-slate-700 transition flex items-center gap-1">
          ← Back to assessments
        </button>
        {confirmingDelete ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500">
              {(existingScores?.length ?? 0) > 0
                ? `Delete this assessment and its ${existingScores!.length} recorded score${existingScores!.length === 1 ? '' : 's'}?`
                : 'Delete this assessment?'}
            </span>
            <button onClick={() => setConfirmingDelete(false)} className="text-sm font-medium text-slate-500 hover:text-slate-700">Cancel</button>
            <button onClick={deleteAssessment} disabled={deleting}
              className="px-3.5 py-1.5 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 rounded-lg transition disabled:opacity-60">
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirmingDelete(true)} className="text-sm font-medium text-red-500 hover:text-red-600">
            Delete assessment
          </button>
        )}
      </div>

      {/* Assessment header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{assessment.title}</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {assessment.subject.name}
            {assessment.class && ` · ${assessment.class.name}`}
            {` · ${CATEGORY_LABEL[assessment.category] ?? assessment.category}`}
            {` · ${assessment.term.name}`}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-slate-900">{assessment.totalScore}</p>
          <p className="text-xs text-slate-400">Total marks</p>
        </div>
      </div>

      {/* Stats */}
      {filledCount > 0 && (
        <div className="flex gap-4 mb-4">
          <div className="bg-white rounded-xl border border-slate-100 px-4 py-3 text-center">
            <p className="text-xs text-slate-400">Entered</p>
            <p className="text-lg font-bold" style={{ color: 'var(--accent)' }}>{filledCount}</p>
          </div>
          {avgScore !== null && (
            <div className="bg-white rounded-xl border border-slate-100 px-4 py-3 text-center">
              <p className="text-xs text-slate-400">Class avg</p>
              <p className="text-lg font-bold text-slate-700">{avgScore} / {assessment.totalScore}</p>
            </div>
          )}
        </div>
      )}

      {alert && <div className="mb-4"><Alert type={alert.type} message={alert.message} /></div>}

      {/* Class filter + Save */}
      <div className="flex items-center justify-between mb-4">
        <select value={effectiveClass} onChange={e => setSelectedClass(e.target.value)}
          className="px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none">
          <option value="">All classes</option>
          {classes?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <SaveButton loading={saving} onClick={saveAll} label={`Save ${filledCount > 0 ? filledCount : ''} scores`} />
      </div>

      {/* Score table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Student</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Class</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">
                Score / {assessment.totalScore}
              </th>
              {bands.length > 0 && (
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">Grade</th>
              )}
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {(loading || studLoading) && Array.from({length:8}).map((_,i) => (
              <tr key={i} className="border-b border-slate-50">
                <td colSpan={5} className="px-4 py-3"><div className="h-7 bg-slate-100 rounded animate-pulse" /></td>
              </tr>
            ))}
            {!loading && students?.map(student => {
              const score  = scores[student.id] ?? { rawScore: '', remarks: '' };
              const cls    = student.classAssignments[0]?.class;
              const raw    = parseFloat(score.rawScore);
              const isOver = !isNaN(raw) && raw > assessment.totalScore;
              const grade  = !isNaN(raw) ? getGradeLabel(raw, assessment.totalScore, bands) : '';

              return (
                <tr key={student.id} className="border-b border-slate-50 hover:bg-slate-50/40 transition">
                  <td className="px-4 py-2.5">
                    <p className="text-sm font-medium text-slate-800">
                      {student.lastName}, {student.firstName}
                    </p>
                    <p className="text-xs font-mono text-slate-400">{student.studentId}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs text-slate-500">{cls?.name ?? '—'}</span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <input
                      type="number"
                      value={score.rawScore}
                      onChange={e => setScore(student.id, 'rawScore', e.target.value)}
                      min={0}
                      max={assessment.totalScore}
                      step={0.5}
                      placeholder="—"
                      className={`w-20 text-center px-2 py-1.5 text-sm border rounded-lg outline-none transition ${
                        isOver ? 'border-red-300 bg-red-50 text-red-600' : 'border-slate-200'
                      }`}
                      onFocus={e => !isOver && (e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)')}
                      onBlur={e => e.currentTarget.style.boxShadow = ''}
                    />
                    {isOver && <p className="text-[10px] text-red-500 mt-0.5">Exceeds total</p>}
                  </td>
                  {bands.length > 0 && (
                    <td className="px-4 py-2.5 text-center">
                      <span className="text-sm font-semibold" style={{ color: grade ? 'var(--accent)' : '#cbd5e1' }}>
                        {grade || '—'}
                      </span>
                    </td>
                  )}
                  <td className="px-4 py-2.5">
                    <input
                      type="text"
                      value={score.remarks}
                      onChange={e => setScore(student.id, 'remarks', e.target.value)}
                      placeholder="Optional…"
                      className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg outline-none"
                      onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
                      onBlur={e => e.currentTarget.style.boxShadow = ''}
                    />
                  </td>
                </tr>
              );
            })}
            {!loading && (!students || students.length === 0) && (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-slate-400">No students found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex justify-end">
        <SaveButton loading={saving} onClick={saveAll} label={`Save ${filledCount > 0 ? filledCount : ''} scores`} />
      </div>
    </div>
  );
}
