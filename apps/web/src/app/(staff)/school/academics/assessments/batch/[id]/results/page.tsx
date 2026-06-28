'use client';

import { useState, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import { staffApi } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { Alert } from '@/components/ui/settings-card';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

// ── Types ─────────────────────────────────────────────────────────────────────

type Subject = { assessmentId: string; subjectId: string; name: string; totalScore: number };

type Cell = {
  assessmentId: string;
  subjectId: string;
  rawScore: number | null;
  totalScore: number;
  percent: number | null;
  grade: string | null;
};

type Row = {
  student: { id: string; studentId: string; firstName: string; lastName: string };
  cells: Cell[];
  subjectsScored: number;
  totalRaw: number;
  totalPossible: number;
  average: number | null;
  overallGrade: string | null;
  position: number | null;
};

type Results = {
  id: string;
  title: string;
  category: string;
  assessmentDate: string | null;
  class: { id: string; name: string };
  term: { id: string; name: string };
  subjects: Subject[];
  students: Row[];
  summary: {
    studentCount: number;
    rankedCount: number;
    classAverage: number | null;
    subjectCount: number;
    fullyScored: boolean;
  };
};

const CATEGORY_LABEL: Record<string, string> = {
  CLASS_EXERCISE: 'Class Exercise', CLASS_TEST: 'Class Test', GROUP_WORK: 'Group Work',
  PROJECT: 'Project Work', HOMEWORK: 'Homework', MID_TERM: 'Mid-Term', END_OF_TERM_EXAM: 'End-of-Term Exam',
};

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BatchResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const fetchResults = useCallback(() => staffApi.get<Results>(`/school/assessments/batches/${id}/results`), [id]);
  const { data, loading } = useApi(fetchResults);

  const [downloading, setDownloading] = useState<'sheet' | 'slips' | null>(null);
  const [alert, setAlert] = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  // Download the broadsheet (and optionally per-student slips) as one PDF. Raw
  // fetch so the bearer token rides along on the binary response.
  async function download(slips: boolean) {
    if (!data) return;
    setAlert(null);
    setDownloading(slips ? 'slips' : 'sheet');
    try {
      const res = await fetch(
        `${API_BASE}/school/assessments/batches/${id}/results/pdf?slips=${slips}`,
        { headers: { Authorization: `Bearer ${localStorage.getItem('so_staff_access')}` } },
      );
      if (!res.ok) {
        let message = 'Failed to download results.';
        try { const b = await res.json(); message = b.message ?? message; } catch {}
        setAlert({ type: 'error', message });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const clean = (s: string) => s.replace(/[\\/]/g, '-');
      a.download = `results-${clean(data.class.name)}-${clean(data.title)}${slips ? '-slips' : ''}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(null);
    }
  }

  if (loading) return (
    <div className="space-y-4">
      <div className="h-16 bg-slate-100 rounded-2xl animate-pulse" />
      <div className="h-64 bg-slate-100 rounded-2xl animate-pulse" />
    </div>
  );

  if (!data) return <p className="text-sm text-slate-400">Results not found.</p>;

  const { subjects, students, summary } = data;

  return (
    <div>
      {/* Back */}
      <button onClick={() => router.push(`/school/academics/assessments/batch/${id}`)}
        className="text-sm text-slate-400 hover:text-slate-700 transition mb-5 flex items-center gap-1">
        ← Back to batch
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-5 gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{data.class.name} — {data.title} · Results</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {CATEGORY_LABEL[data.category] ?? data.category}
            {` · ${data.term.name}`}
            {` · ${summary.studentCount} student${summary.studentCount === 1 ? '' : 's'}`}
            {summary.classAverage != null && ` · Class avg ${summary.classAverage}%`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => download(false)} disabled={downloading !== null}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-700 hover:bg-slate-50 transition disabled:opacity-50">
            {downloading === 'sheet' ? 'Preparing…' : '↓ Broadsheet PDF'}
          </button>
          <button onClick={() => download(true)} disabled={downloading !== null}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
            title="Broadsheet plus a one-page result slip per student">
            {downloading === 'slips' ? 'Preparing…' : '↓ With slips'}
          </button>
        </div>
      </div>

      {alert && <div className="mb-4"><Alert type={alert.type} message={alert.message} /></div>}

      {/* Provisional warning */}
      {!summary.fullyScored && students.length > 0 && (
        <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <span className="mt-0.5 text-amber-500">⚠</span>
          <p className="text-sm text-amber-800">
            <span className="font-semibold">Provisional results.</span>{' '}
            Not all subjects have scores yet — averages and positions are based only on the subjects scored so far.
          </p>
        </div>
      )}

      {/* Broadsheet */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide sticky left-0 bg-slate-50">Student</th>
              {subjects.map(s => (
                <th key={s.subjectId} className="px-2 py-3 text-center text-xs font-semibold text-slate-400 tracking-wide whitespace-nowrap" title={`${s.name} (out of ${s.totalScore})`}>
                  {s.name}
                </th>
              ))}
              <th className="px-3 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">Avg</th>
              <th className="px-3 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">Grade</th>
              <th className="px-3 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">Pos</th>
            </tr>
          </thead>
          <tbody>
            {students.map((r, i) => (
              <tr key={r.student.id} className={`border-b border-slate-50 ${i % 2 ? 'bg-slate-50/40' : ''}`}>
                <td className="px-4 py-3 sticky left-0 bg-inherit whitespace-nowrap">
                  <span className="font-medium text-slate-800">{r.student.lastName}, {r.student.firstName}</span>
                  <span className="ml-2 text-xs font-mono text-slate-400">{r.student.studentId}</span>
                </td>
                {r.cells.map(c => (
                  <td key={c.assessmentId} className="px-2 py-3 text-center">
                    {c.rawScore != null
                      ? <span className="text-slate-700">{c.rawScore}</span>
                      : <span className="text-slate-300">—</span>}
                  </td>
                ))}
                <td className="px-3 py-3 text-center font-semibold text-slate-800">{r.average != null ? `${r.average}%` : '—'}</td>
                <td className="px-3 py-3 text-center text-slate-600">{r.overallGrade ?? '—'}</td>
                <td className="px-3 py-3 text-center text-slate-600">{r.position != null ? ordinal(r.position) : '—'}</td>
              </tr>
            ))}
            {students.length === 0 && (
              <tr><td colSpan={subjects.length + 4} className="px-4 py-12 text-center text-sm text-slate-400">
                No students enrolled in this class.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-slate-400">
        Positions rank students by their average across subjects (each subject weighted equally regardless of its mark total).
        This is a snapshot of this exam only — it does not affect terminal report cards.
      </p>
    </div>
  );
}
