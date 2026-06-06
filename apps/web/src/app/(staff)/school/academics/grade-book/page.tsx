'use client';

import { useState, useCallback } from 'react';
import { staffApi } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { useTeacherScope } from '@/hooks/use-teacher-scope';

// ── Types ─────────────────────────────────────────────────────────────────────

type GradeBookEntry = {
  student: { id: string; studentId: string; firstName: string; lastName: string };
  assessments: {
    assessmentId: string;
    title: string;
    totalScore: number;
    rawScore: number | null;
    displayGrade: string | null;
  }[];
  termAvg: number | null;
  displayGrade: string | null;
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function GradeBookPage() {
  const scope = useTeacherScope();

  const [classId, setClassId] = useState('');
  const [termId, setTermId]   = useState('');

  const fetchClasses = useCallback(() => staffApi.get<{ id: string; name: string }[]>('/school/grade-structure/classes'), []);
  const fetchTerms   = useCallback(() =>
    staffApi.get<any>('/school/academic-years/active')
      .then(y => y?.terms ?? []).catch(() => []),
    [],
  );

  const { data: allClasses } = useApi(fetchClasses);
  const { data: terms }      = useApi(fetchTerms);

  // Restrict class list for teachers
  const classes = scope.restricted
    ? (allClasses ?? []).filter(c => scope.assignedClassIds.includes(c.id))
    : (allClasses ?? []);

  const activeTermId  = termId  || terms?.find((t: any) => t.isActive)?.id || '';
  const activeClassId = classId || classes?.[0]?.id || '';

  const fetchGradeBook = useCallback(
    () => activeClassId && activeTermId
      ? staffApi.get<GradeBookEntry[]>(`/school/assessments/grade-book/${activeClassId}?termId=${activeTermId}`).catch(() => [])
      : Promise.resolve([]),
    [activeClassId, activeTermId],
  );
  const { data: entries, loading } = useApi(fetchGradeBook);

  // Collect all unique assessment columns
  const assessmentCols = entries?.[0]?.assessments ?? [];

  function scoreColor(score: number | null, total: number): string {
    if (score === null) return '#94a3b8';
    const pct = (score / total) * 100;
    if (pct >= 70) return '#22c55e';
    if (pct >= 50) return '#f59e0b';
    return '#ef4444';
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-bold text-slate-900">Grade Book</h2>
        <div className="flex gap-3">
          <select value={activeTermId} onChange={e => setTermId(e.target.value)}
            className="px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none">
            <option value="">Select term…</option>
            {terms?.map((t: any) => <option key={t.id} value={t.id}>{t.name}{t.isActive ? ' (Active)' : ''}</option>)}
          </select>
          <select value={activeClassId} onChange={e => setClassId(e.target.value)}
            className="px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none">
            <option value="">Select class…</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {!activeClassId || !activeTermId ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-6 py-16 text-center text-sm text-slate-400">
          Select a class and term to view the grade book.
        </div>
      ) : loading ? (
        <div className="h-64 bg-slate-100 rounded-2xl animate-pulse" />
      ) : !entries || entries.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-6 py-16 text-center text-sm text-slate-400">
          No grade data yet for this class and term. Create assessments and enter scores first.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide sticky left-0 bg-slate-50 min-w-[160px]">
                    Student
                  </th>
                  {assessmentCols.map(a => (
                    <th key={a.assessmentId} className="px-3 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide min-w-[100px]">
                      <div>{a.title}</div>
                      <div className="text-slate-300 font-normal normal-case">/{a.totalScore}</div>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide min-w-[100px]" style={{ color: 'var(--accent)' }}>
                    Average
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide min-w-[80px]" style={{ color: 'var(--accent)' }}>
                    Grade
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, i) => (
                  <tr key={entry.student.id} className={`border-b border-slate-50 ${i % 2 === 0 ? '' : 'bg-slate-50/30'}`}>
                    <td className="px-4 py-2.5 sticky left-0 bg-inherit">
                      <p className="text-sm font-medium text-slate-800">
                        {entry.student.lastName}, {entry.student.firstName}
                      </p>
                      <p className="text-xs font-mono text-slate-400">{entry.student.studentId}</p>
                    </td>
                    {entry.assessments.map(a => (
                      <td key={a.assessmentId} className="px-3 py-2.5 text-center">
                        <div className="flex flex-col items-center">
                          <span
                            className="text-sm font-semibold"
                            style={{ color: scoreColor(a.rawScore, a.totalScore) }}
                          >
                            {a.rawScore !== null ? a.rawScore : '—'}
                          </span>
                          {a.displayGrade && (
                            <span className="text-[10px] text-slate-400">{a.displayGrade}</span>
                          )}
                        </div>
                      </td>
                    ))}
                    <td className="px-4 py-2.5 text-center">
                      <span
                        className="text-sm font-bold"
                        style={{ color: scoreColor(entry.termAvg, 100) }}
                      >
                        {entry.termAvg !== null ? `${entry.termAvg}%` : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="text-sm font-bold" style={{ color: 'var(--accent)' }}>
                        {entry.displayGrade ?? '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
