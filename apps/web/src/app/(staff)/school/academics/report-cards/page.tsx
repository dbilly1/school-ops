'use client';

import { useState, useCallback } from 'react';
import { staffApi, type ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { Alert } from '@/components/ui/settings-card';
import { ClassTabs } from '@/components/ui/class-tabs';

// ── Types ─────────────────────────────────────────────────────────────────────

type ReportCard = {
  id: string;
  studentId: string;
  student: { firstName: string; lastName: string; studentId: string };
  termId: string;
  publishedAt: string | null;
  generatedAt: string;
  aggregate: number | null;
  position: number | null;
  classSize: number | null;
};

// ── Report card row ───────────────────────────────────────────────────────────

function ReportCardRow({ card, apiBase }: { card: ReportCard; apiBase: string }) {
  const [downloading, setDownloading] = useState(false);

  async function downloadPdf() {
    setDownloading(true);
    try {
      const res = await fetch(
        `${apiBase}/school/report-cards/student/${card.studentId}/pdf?termId=${card.termId}`,
        { headers: { Authorization: `Bearer ${localStorage.getItem('so_staff_access')}` } },
      );
      const blob  = await res.blob();
      const url   = URL.createObjectURL(blob);
      const a     = document.createElement('a');
      a.href      = url;
      a.download  = `report-card-${card.student.studentId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <tr className="border-b border-slate-50 hover:bg-slate-50/60 transition">
      <td className="px-4 py-3.5">
        <p className="text-sm font-medium text-slate-800">
          {card.student.lastName}, {card.student.firstName}
        </p>
        <p className="text-xs font-mono text-slate-400">{card.student.studentId}</p>
      </td>
      <td className="px-4 py-3.5 text-center">
        <span className="text-sm font-medium text-slate-700">{card.aggregate != null ? `${card.aggregate}%` : '—'}</span>
      </td>
      <td className="px-4 py-3.5 text-center">
        <span className="text-sm text-slate-600">{card.position != null ? `${card.position}${card.classSize ? ` / ${card.classSize}` : ''}` : '—'}</span>
      </td>
      <td className="px-4 py-3.5 hidden md:table-cell">
        <span className="text-xs text-slate-500">
          {new Date(card.generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
      </td>
      <td className="px-4 py-3.5">
        {card.publishedAt ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Published
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
            Draft
          </span>
        )}
      </td>
      <td className="px-4 py-3.5 text-right">
        <button
          onClick={downloadPdf}
          disabled={downloading}
          className="text-xs font-medium transition disabled:opacity-40"
          style={{ color: 'var(--accent)' }}
        >
          {downloading ? 'Downloading…' : '↓ PDF'}
        </button>
      </td>
    </tr>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ReportCardsPage() {
  const [classId, setClassId]   = useState('');
  const [termId, setTermId]     = useState('');
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [alert, setAlert]       = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

  const fetchClasses = useCallback(() => staffApi.get<{ id: string; name: string }[]>('/school/grade-structure/classes'), []);
  const fetchTerms   = useCallback(() =>
    staffApi.get<any>('/school/academic-years/active').then(y => y?.terms ?? []).catch(() => []),
    [],
  );

  const { data: classes } = useApi(fetchClasses);
  const { data: terms }   = useApi(fetchTerms);

  const activeTermId  = termId  || terms?.find((t: any) => t.isActive)?.id  || '';
  const activeClassId = classId || classes?.[0]?.id || '';

  const fetchCards = useCallback(
    () => activeClassId && activeTermId
      ? staffApi.get<ReportCard[]>(`/school/report-cards/class/${activeClassId}?termId=${activeTermId}`).catch(() => [])
      : Promise.resolve([]),
    [activeClassId, activeTermId],
  );
  const { data: cards, loading, refetch } = useApi(fetchCards, `${activeClassId}|${activeTermId}`);

  const unpublishedCount = cards?.filter(c => !c.publishedAt).length ?? 0;
  const publishedCount   = cards?.filter(c => c.publishedAt).length  ?? 0;

  async function generate() {
    if (!activeClassId || !activeTermId) return;
    setAlert(null); setGenerating(true);
    try {
      await staffApi.post('/school/report-cards/generate', {
        classId: activeClassId,
        termId:  activeTermId,
      });
      setAlert({ type: 'success', message: 'Report cards generated successfully.' });
      refetch();
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Failed to generate report cards.' });
    } finally {
      setGenerating(false);
    }
  }

  async function publishAll() {
    if (!activeTermId || !activeClassId || !cards) return;
    const draftCount = cards.filter(c => !c.publishedAt).length;
    if (!draftCount) return;
    setAlert(null); setPublishing(true);
    try {
      await staffApi.post('/school/report-cards/publish', { classId: activeClassId, termId: activeTermId });
      setAlert({ type: 'success', message: `${draftCount} report card${draftCount !== 1 ? 's' : ''} published. Students and parents will be notified.` });
      refetch();
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Failed to publish.' });
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Report Cards</h2>
          <p className="text-sm text-slate-500 mt-0.5">Generate, review, and publish term report cards per class.</p>
        </div>

        <select value={activeTermId} onChange={e => setTermId(e.target.value)}
          className="px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none">
          <option value="">Select term…</option>
          {terms?.map((t: any) => <option key={t.id} value={t.id}>{t.name}{t.isActive ? ' ✓' : ''}</option>)}
        </select>
      </div>

      {/* Class tabs */}
      <ClassTabs classes={classes ?? []} value={activeClassId} onChange={setClassId} />

      {alert && <div className="mb-4"><Alert type={alert.type} message={alert.message} /></div>}

      {/* Actions */}
      {activeClassId && activeTermId && (
        <div className="flex items-center gap-3 mb-5 p-4 bg-white rounded-xl border border-slate-100 shadow-sm">
          <div className="flex-1">
            {cards && cards.length > 0 ? (
              <p className="text-sm text-slate-600">
                <span className="font-semibold text-slate-800">{cards.length}</span> report cards ·{' '}
                <span className="font-semibold text-emerald-600">{publishedCount}</span> published ·{' '}
                <span className="font-semibold text-amber-600">{unpublishedCount}</span> draft
              </p>
            ) : (
              <p className="text-sm text-slate-500">No report cards generated yet for this class and term.</p>
            )}
          </div>

          <button
            onClick={generate}
            disabled={generating}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
          >
            {generating ? 'Generating…' : cards && cards.length > 0 ? '↺ Regenerate' : 'Generate report cards'}
          </button>

          {unpublishedCount > 0 && (
            <button
              onClick={publishAll}
              disabled={publishing}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition disabled:opacity-50"
              style={{ backgroundColor: 'var(--accent)' }}
              onMouseEnter={e => !publishing && (e.currentTarget.style.backgroundColor = 'var(--accent-hover)')}
              onMouseLeave={e => !publishing && (e.currentTarget.style.backgroundColor = 'var(--accent)')}
            >
              {publishing ? 'Publishing…' : `Publish ${unpublishedCount} draft${unpublishedCount !== 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      )}

      {/* Report cards table */}
      {(!activeClassId || !activeTermId) && (
        <div className="bg-white rounded-2xl border border-slate-100 px-6 py-16 text-center text-sm text-slate-400">
          Select a class and term to manage report cards.
        </div>
      )}

      {activeClassId && activeTermId && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Student</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">Aggregate</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">Position</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide hidden md:table-cell">Generated</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({length:6}).map((_,i) => (
                <tr key={i} className="border-b border-slate-50">
                  <td colSpan={6} className="px-4 py-3"><div className="h-7 bg-slate-100 rounded animate-pulse" /></td>
                </tr>
              ))}
              {!loading && cards?.map(card => (
                <ReportCardRow key={card.id} card={card} apiBase={API_BASE} />
              ))}
              {!loading && (!cards || cards.length === 0) && (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-400">
                  No report cards. Click "Generate report cards" to create them.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
