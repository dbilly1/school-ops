'use client';

import { useState, useCallback } from 'react';
import { portalApi } from '@/lib/api';
import { useApi } from '@/hooks/use-api';

// The portal exposes per-term report cards; grades are the subject breakdown of
// the selected term's card (/portal/report-cards/:termId).
type ReportCardListItem = {
  id: string;
  termId: string;
  term: { name: string; academicYear: { name: string } };
};

type SubjectResult = {
  subjectId: string;
  subject: string;
  sbaScore: number;        // 0–50 (scaled to SBA weight)
  examScore: number;       // 0–50 (scaled to exam weight)
  total: number | null;    // 0–100, or null when not yet scored
  gradeLabel: string | null;
  remark: string | null;
};

type ReportCardDetail = {
  subjects: SubjectResult[];
  aggregate: number;
  overallGrade: string | null;
  position: number | null;
  classSize: number | null;
};

function scoreColor(pct: number | null): string {
  if (pct === null) return '#94a3b8';
  if (pct >= 70) return '#16a34a';
  if (pct >= 50) return '#d97706';
  return '#dc2626';
}

export default function PortalGradesPage() {
  const fetchTerms = useCallback(
    () => portalApi.get<ReportCardListItem[]>('/portal/report-cards').catch(() => []),
    [],
  );
  const { data: terms, loading: termsLoading } = useApi(fetchTerms);

  const [selectedTermId, setSelectedTermId] = useState<string | null>(null);
  const activeTermId = selectedTermId ?? terms?.[0]?.termId ?? null;

  const fetchDetail = useCallback(
    () => activeTermId
      ? portalApi.get<ReportCardDetail>(`/portal/report-cards/${activeTermId}`).catch(() => null)
      : Promise.resolve(null),
    [activeTermId],
  );
  const { data: detail, loading: detailLoading } = useApi(fetchDetail, activeTermId);

  const loading = termsLoading || (activeTermId != null && detailLoading);
  const subjects = detail?.subjects ?? [];

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-lg font-bold text-slate-900">Academic Progress</h1>
        <p className="text-xs text-slate-400 mt-0.5">Your subject scores, term by term</p>
      </header>

      {/* Term selector */}
      {!termsLoading && terms && terms.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {terms.map(t => {
            const active = t.termId === activeTermId;
            return (
              <button
                key={t.id}
                onClick={() => setSelectedTermId(t.termId)}
                className="px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition"
                style={active
                  ? { backgroundColor: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff' }
                  : { borderColor: '#e2e8f0', color: '#475569', backgroundColor: '#fff' }}
              >
                {t.term.name}
              </button>
            );
          })}
        </div>
      )}

      {loading && <div className="space-y-3">{[1, 2].map(i => <div key={i} className="h-28 bg-slate-100 rounded-2xl animate-pulse" />)}</div>}

      {!loading && (!terms || terms.length === 0) && (
        <div className="bg-white rounded-2xl border border-slate-100 px-4 py-12 text-center">
          <p className="text-2xl mb-3">📊</p>
          <p className="text-sm font-medium text-slate-600">No grades yet</p>
          <p className="text-xs text-slate-400 mt-1">Scores appear once your report card is published.</p>
        </div>
      )}

      {!loading && detail && (
        <>
          {/* Term summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-3 py-4 text-center">
              <p className="text-[11px] text-slate-400">Aggregate</p>
              <p className="text-2xl font-bold" style={{ color: scoreColor(detail.aggregate) }}>{detail.aggregate}%</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-3 py-4 text-center">
              <p className="text-[11px] text-slate-400">Grade</p>
              <p className="text-2xl font-bold" style={{ color: 'var(--accent)' }}>{detail.overallGrade ?? '—'}</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-3 py-4 text-center">
              <p className="text-[11px] text-slate-400">Position</p>
              <p className="text-2xl font-bold text-slate-700">
                {detail.position ? detail.position : '—'}
                {detail.position && detail.classSize ? <span className="text-xs text-slate-400">/{detail.classSize}</span> : null}
              </p>
            </div>
          </div>

          {/* Subjects */}
          {subjects.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 px-4 py-10 text-center text-sm text-slate-400">
              No subject scores recorded for this term.
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm divide-y divide-slate-50 overflow-hidden">
              {subjects.map(s => (
                <div key={s.subjectId} className="px-4 py-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-sm font-semibold text-slate-800">{s.subject}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold" style={{ color: scoreColor(s.total) }}>
                        {s.total !== null ? `${s.total}%` : '—'}
                      </span>
                      {s.gradeLabel && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: 'var(--accent)' }}>
                          {s.gradeLabel}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-[11px] text-slate-400">
                    <span>Class score <span className="font-medium text-slate-600">{s.sbaScore}</span></span>
                    <span>Exam <span className="font-medium text-slate-600">{s.examScore}</span></span>
                    {s.remark && <span className="ml-auto italic text-slate-400 truncate">{s.remark}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
