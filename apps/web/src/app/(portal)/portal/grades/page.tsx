'use client';

import { useCallback } from 'react';
import { portalApi } from '@/lib/api';
import { useApi } from '@/hooks/use-api';

type TermGrades = {
  termId: string;
  termName: string;
  academicYear: string;
  subjects: {
    subjectName: string;
    assessments: {
      title: string;
      rawScore: number | null;
      totalScore: number;
      displayGrade: string | null;
    }[];
    termAvg: number | null;
    termGrade: string | null;
  }[];
};

function scoreColor(score: number | null, total: number): string {
  if (score === null) return '#94a3b8';
  const pct = (score / total) * 100;
  if (pct >= 70) return '#22c55e';
  if (pct >= 50) return '#f59e0b';
  return '#ef4444';
}

export default function PortalGradesPage() {
  const fetchGrades = useCallback(() =>
    portalApi.get<TermGrades[]>('/portal/report-cards').catch(() => []), []);
  const { data, loading } = useApi(fetchGrades);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Academic Progress</h1>
        <p className="text-xs text-slate-400 mt-0.5">Your grades and assessment scores</p>
      </div>

      {loading && <div className="space-y-3">{[1,2].map(i => <div key={i} className="h-32 bg-slate-100 rounded-xl animate-pulse" />)}</div>}

      {!loading && (!data || data.length === 0) && (
        <div className="bg-white rounded-xl border border-slate-100 px-4 py-12 text-center text-sm text-slate-400">
          No grade data available yet.
        </div>
      )}

      {!loading && data?.map(term => (
        <div key={term.termId} className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-800">{term.termName}</p>
            <p className="text-xs text-slate-400">{term.academicYear}</p>
          </div>
          <div className="divide-y divide-slate-50">
            {term.subjects.map(subject => (
              <div key={subject.subjectName} className="px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-slate-800">{subject.subjectName}</p>
                  <div className="flex items-center gap-2">
                    {subject.termAvg !== null && (
                      <span className="text-xs font-bold" style={{ color: scoreColor(subject.termAvg, 100) }}>
                        {subject.termAvg}%
                      </span>
                    )}
                    {subject.termGrade && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: 'var(--accent)' }}>
                        {subject.termGrade}
                      </span>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  {subject.assessments.map((a, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <p className="text-xs text-slate-500">{a.title}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium" style={{ color: scoreColor(a.rawScore, a.totalScore) }}>
                          {a.rawScore !== null ? `${a.rawScore}/${a.totalScore}` : '—'}
                        </span>
                        {a.displayGrade && (
                          <span className="text-[10px] text-slate-400">{a.displayGrade}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
