'use client';

import { useState, useCallback, useMemo } from 'react';
import { portalApi } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { EmptyState } from '@/components/portal/empty-state';

// /portal/grades = the student's gradebook: every recorded assessment score,
// flattened. We group it client-side by the selected term, then by subject.
type Score = {
  assessmentId: string;
  title: string;
  category: string;
  date: string;
  subjectId: string;
  subjectName: string;
  termId: string;
  termName: string;
  rawScore: number;
  totalScore: number;
  percentage: number;
  gradeLabel: string | null;
};
type Gradebook = { terms: { id: string; name: string }[]; scores: Score[] };

function prettyCategory(c: string) {
  return c.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, m => m.toUpperCase());
}
function scoreColor(pct: number): string {
  if (pct >= 70) return '#16a34a';
  if (pct >= 50) return '#d97706';
  return '#dc2626';
}

export default function PortalGradesPage() {
  const fetchGrades = useCallback(
    () => portalApi.get<Gradebook>('/portal/grades').catch(() => ({ terms: [], scores: [] } as Gradebook)),
    [],
  );
  const { data, loading } = useApi(fetchGrades);

  const terms = data?.terms ?? [];
  const [selectedTermId, setSelectedTermId] = useState<string | null>(null);
  const activeTermId = selectedTermId ?? terms[0]?.id ?? null;

  // Group the active term's scores by subject, with a subject average.
  const subjects = useMemo(() => {
    if (!data || !activeTermId) return [];
    const bySubject = new Map<string, { name: string; items: Score[] }>();
    for (const s of data.scores) {
      if (s.termId !== activeTermId) continue;
      const entry = bySubject.get(s.subjectId) ?? { name: s.subjectName, items: [] };
      entry.items.push(s);
      bySubject.set(s.subjectId, entry);
    }
    return [...bySubject.entries()]
      .map(([subjectId, { name, items }]) => ({
        subjectId,
        name,
        items,
        avg: Math.round(items.reduce((sum, i) => sum + i.percentage, 0) / items.length),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data, activeTermId]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-lg font-bold text-slate-900">Gradebook</h1>
        <p className="text-xs text-slate-400 mt-0.5">Every assessment score your teachers have recorded</p>
      </header>

      {/* Term selector */}
      {!loading && terms.length > 0 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
          {terms.map(t => {
            const active = t.id === activeTermId;
            return (
              <button
                key={t.id}
                onClick={() => setSelectedTermId(t.id)}
                className="px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition shrink-0"
                style={active
                  ? { backgroundColor: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff' }
                  : { borderColor: '#e2e8f0', color: '#475569', backgroundColor: '#fff' }}
              >
                {t.name}
              </button>
            );
          })}
        </div>
      )}

      {loading && <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-28 bg-slate-100 rounded-2xl animate-pulse" />)}</div>}

      {!loading && subjects.length === 0 && (
        <EmptyState icon="grades" title="No scores yet" subtitle="Assessment scores will appear here as your teachers record them." />
      )}

      {!loading && subjects.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {subjects.map(subject => (
            <div key={subject.subjectId} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 flex items-center justify-between border-b border-slate-50">
                <p className="text-sm font-semibold text-slate-800">{subject.name}</p>
                <span className="text-sm font-bold" style={{ color: scoreColor(subject.avg) }}>{subject.avg}%</span>
              </div>
              <div className="divide-y divide-slate-50">
                {subject.items.map(a => (
                  <div key={a.assessmentId} className="px-4 py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-slate-700 truncate">{a.title}</p>
                      <p className="text-[11px] text-slate-400">{prettyCategory(a.category)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold" style={{ color: scoreColor(a.percentage) }}>
                        {a.rawScore}<span className="text-slate-300">/{a.totalScore}</span>
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {a.percentage}%{a.gradeLabel ? ` · ${a.gradeLabel}` : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
