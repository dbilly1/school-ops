'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { staffApi, type ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { useTeacherScope } from '@/hooks/use-teacher-scope';
import { Alert } from '@/components/ui/settings-card';
import { ClassTabs } from '@/components/ui/class-tabs';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

// ── Types ─────────────────────────────────────────────────────────────────────

type CardStatus = 'NOT_GENERATED' | 'DRAFT' | 'PUBLISHED';

type ReportCard = {
  id: string | null;
  studentId: string;
  student: { firstName: string; lastName: string; studentId: string };
  termId: string;
  status: CardStatus;
  stale: boolean;
  publishedAt: string | null;
  generatedAt: string | null;
  aggregate: number | null;
  position: number | null;
  classSize: number | null;
};

type Term = { id: string; name: string; isActive: boolean };
type AcademicYear = { id: string; name: string; isActive: boolean; terms: Term[] };
type Enrollment = { inYear: number; total: number; otherYears: number };

// ── Report card row ───────────────────────────────────────────────────────────

function StatusChip({ status }: { status: CardStatus }) {
  if (status === 'PUBLISHED') return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Published
    </span>
  );
  if (status === 'DRAFT') return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Draft
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-300" /> Not generated
    </span>
  );
}

function StaleChip() {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-orange-600" title="Scores changed since this card was generated. Regenerate to update it.">
      <span className="w-1.5 h-1.5 rounded-full bg-orange-400" /> Stale
    </span>
  );
}

function ReportCardRow({ card, onPreview }: { card: ReportCard; onPreview: () => void }) {
  return (
    <tr onClick={onPreview} className="border-b border-slate-50 hover:bg-slate-50/60 transition cursor-pointer">
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
          {card.generatedAt ? new Date(card.generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
        </span>
      </td>
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-2">
          <StatusChip status={card.status} />
          {card.stale && <StaleChip />}
        </div>
      </td>
      <td className="px-4 py-3.5 text-right whitespace-nowrap">
        <span className="text-xs font-medium" style={{ color: 'var(--accent)' }}>Preview →</span>
      </td>
    </tr>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ReportCardsPage() {
  const router = useRouter();
  const scope  = useTeacherScope();
  const [classId, setClassId]   = useState('');
  const [yearId, setYearId]     = useState('');
  const [termId, setTermId]     = useState('');
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [publishedOnly, setPublishedOnly]   = useState(true);
  const [alert, setAlert]       = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  const fetchClasses = useCallback(() => staffApi.get<{ id: string; name: string }[]>('/school/grade-structure/classes'), []);
  // All academic years (each with its terms), so report cards for past years are
  // reachable too — not just the active year. GET is open to any staff.
  const fetchYears = useCallback(() => staffApi.get<AcademicYear[]>('/school/academic-years').catch(() => []), []);

  const { data: allClasses } = useApi(fetchClasses);
  const { data: years }      = useApi(fetchYears);

  // Restrict the class list for teachers to their assigned classes (mirrors the
  // grade-book / assessments pages); admins see every class.
  const classes = scope.restricted
    ? (allClasses ?? []).filter(c => scope.assignedClassIds.includes(c.id))
    : (allClasses ?? []);

  // Default to the active year, then its active (or first) term. A manual year
  // pick ignores a stale term from the previous year and falls back cleanly.
  const activeYearId  = yearId || years?.find(y => y.isActive)?.id || years?.[0]?.id || '';
  const selectedYear  = years?.find(y => y.id === activeYearId);
  const terms         = selectedYear?.terms ?? [];
  const activeTermId  = (termId && terms.some(t => t.id === termId))
    ? termId
    : (terms.find(t => t.isActive)?.id ?? terms[0]?.id ?? '');
  const activeClassId = classId || classes?.[0]?.id || '';

  // Only the class teacher (or an unrestricted owner/admin) may generate, publish
  // or discard. A subject teacher can still preview the cards for their classes,
  // but the management actions are hidden — the API enforces the same rule.
  const canManage = !scope.restricted || scope.isClassTeacherOf(activeClassId);

  const fetchCards = useCallback(
    () => activeClassId && activeTermId
      ? staffApi.get<ReportCard[]>(`/school/report-cards/class/${activeClassId}?termId=${activeTermId}`).catch(() => [])
      : Promise.resolve([]),
    [activeClassId, activeTermId],
  );
  const { data: cards, loading, refetch } = useApi(fetchCards, `${activeClassId}|${activeTermId}`);

  // Roster counts, used only to explain an empty list (enrolled this year vs.
  // students who sit in this class in another year).
  const fetchEnrollment = useCallback(
    () => activeClassId && activeTermId
      ? staffApi.get<Enrollment>(`/school/report-cards/class/${activeClassId}/enrollment?termId=${activeTermId}`).catch(() => null)
      : Promise.resolve(null),
    [activeClassId, activeTermId],
  );
  const { data: enrollment } = useApi(fetchEnrollment, `e|${activeClassId}|${activeTermId}`);

  const generatedCount   = cards?.filter(c => c.status !== 'NOT_GENERATED').length ?? 0;
  const publishedCount   = cards?.filter(c => c.status === 'PUBLISHED').length ?? 0;
  const unpublishedCount = cards?.filter(c => c.status === 'DRAFT').length ?? 0;
  const staleCount       = cards?.filter(c => c.stale).length ?? 0;

  // How many cards the "Download all" button will bundle, given the toggle.
  const downloadCount = publishedOnly ? publishedCount : generatedCount;

  // Explain an empty roster: enrolment is per-year, so a class can be empty for
  // the chosen year while its students sit in it under a different year.
  const yearName = selectedYear?.name ?? 'this year';
  const emptyMessage =
    enrollment && enrollment.total > 0 && enrollment.inYear === 0
      ? `No students are enrolled in this class for ${yearName}. ${enrollment.otherYears} ${enrollment.otherYears === 1 ? 'student sits' : 'students sit'} in this class in another year — promote or enrol them into ${yearName} (Settings → Progression).`
      : 'No students assigned to this class yet.';

  function openPreview(studentId: string) {
    router.push(`/school/academics/report-cards/${studentId}?termId=${activeTermId}`);
  }

  // Download every (published, or all generated) card in the class as one PDF —
  // one student per page. Uses a raw fetch so the auth header rides along on the
  // binary response (mirrors the single-card download).
  async function downloadAll() {
    if (!activeClassId || !activeTermId || downloadCount === 0) return;
    setAlert(null); setDownloadingAll(true);
    try {
      const res = await fetch(
        `${API_BASE}/school/report-cards/class/${activeClassId}/pdf?termId=${activeTermId}&publishedOnly=${publishedOnly}`,
        { headers: { Authorization: `Bearer ${localStorage.getItem('so_staff_access')}` } },
      );
      if (!res.ok) {
        let message = 'Failed to download report cards.';
        try { const b = await res.json(); message = b.message ?? message; } catch {}
        setAlert({ type: 'error', message });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const className = (classes.find(c => c.id === activeClassId)?.name ?? 'class').replace(/[\\/]/g, '-');
      const termName  = (terms?.find((t: any) => t.id === activeTermId)?.name ?? '').replace(/[\\/]/g, '-');
      a.download = `report-cards-${className}${termName ? `-${termName}` : ''}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloadingAll(false);
    }
  }

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
    const draftCount = cards.filter(c => c.status === 'DRAFT').length;
    if (!draftCount) return;
    setAlert(null); setPublishing(true);
    try {
      const res = await staffApi.post<{ published: number; skipped: number }>('/school/report-cards/publish', { classId: activeClassId, termId: activeTermId });
      const skipped = res?.skipped ?? 0;
      setAlert({
        type: 'success',
        message: `${res?.published ?? draftCount} report card${(res?.published ?? draftCount) !== 1 ? 's' : ''} published. Students and parents will be notified.`
          + (skipped ? ` ${skipped} skipped (not generated yet).` : ''),
      });
      refetch();
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Failed to publish.' });
    } finally {
      setPublishing(false);
    }
  }

  async function discardDrafts() {
    if (!activeTermId || !activeClassId || !unpublishedCount) return;
    if (!window.confirm(`Discard ${unpublishedCount} draft report card${unpublishedCount !== 1 ? 's' : ''}? This clears the generated scores and positions (any saved remarks are kept). Published cards are not affected.`)) return;
    setAlert(null); setDiscarding(true);
    try {
      const res = await staffApi.post<{ cancelled: number }>('/school/report-cards/cancel', { classId: activeClassId, termId: activeTermId });
      setAlert({ type: 'success', message: `${res?.cancelled ?? 0} report card${(res?.cancelled ?? 0) !== 1 ? 's' : ''} discarded.` });
      refetch();
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Failed to discard.' });
    } finally {
      setDiscarding(false);
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Report Cards</h2>
          <p className="text-sm text-slate-500 mt-0.5">Generate, review, and publish term report cards per class.</p>
        </div>

        <div className="flex items-center gap-2">
          <select value={activeYearId} onChange={e => { setYearId(e.target.value); setTermId(''); }}
            className="px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none">
            {years?.map(y => <option key={y.id} value={y.id}>{y.name}{y.isActive ? ' (Active)' : ''}</option>)}
          </select>
          <select value={activeTermId} onChange={e => setTermId(e.target.value)}
            className="px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none">
            <option value="">Select term…</option>
            {terms.map(t => <option key={t.id} value={t.id}>{t.name}{t.isActive ? ' ✓' : ''}</option>)}
          </select>
        </div>
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
                <span className="font-semibold text-slate-800">{cards.length}</span> students ·{' '}
                <span className="font-semibold text-slate-700">{generatedCount}</span> generated ·{' '}
                <span className="font-semibold text-emerald-600">{publishedCount}</span> published ·{' '}
                <span className="font-semibold text-amber-600">{unpublishedCount}</span> draft
              </p>
            ) : (
              <p className="text-sm text-slate-500">{emptyMessage}</p>
            )}
          </div>

          {!canManage && (
            <span className="text-xs text-slate-400" title="Only the class teacher can generate or publish report cards.">
              View only — managed by the class teacher
            </span>
          )}

          {/* Download the whole class as one PDF — available to anyone who can
              view (printing is allowed for subject teachers too). */}
          {generatedCount > 0 && (
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-slate-500 select-none cursor-pointer" title="Include only published cards. Uncheck to include drafts too.">
                <input type="checkbox" checked={publishedOnly} onChange={e => setPublishedOnly(e.target.checked)} />
                Published only
              </label>
              <button
                onClick={downloadAll}
                disabled={downloadingAll || downloadCount === 0}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
                title={downloadCount === 0 ? (publishedOnly ? 'No published cards yet' : 'No generated cards yet') : undefined}
              >
                {downloadingAll ? 'Preparing…' : `↓ Download all (${downloadCount})`}
              </button>
            </div>
          )}

          {canManage && (
            <button
              onClick={generate}
              disabled={generating}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
            >
              {generating ? 'Generating…' : generatedCount > 0 ? '↺ Regenerate' : 'Generate report cards'}
            </button>
          )}

          {canManage && unpublishedCount > 0 && (
            <button
              onClick={discardDrafts}
              disabled={discarding}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition disabled:opacity-50"
            >
              {discarding ? 'Discarding…' : 'Discard drafts'}
            </button>
          )}

          {canManage && unpublishedCount > 0 && (
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

      {/* Stale warning */}
      {staleCount > 0 && (
        <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3">
          <span className="mt-0.5 text-orange-500">⚠</span>
          <p className="text-sm text-orange-800">
            <span className="font-semibold">{staleCount} report card{staleCount !== 1 ? 's are' : ' is'} out of date.</span>{' '}
            Scores changed after {staleCount !== 1 ? 'they were' : 'it was'} generated. Click <span className="font-medium">Regenerate</span> to refresh {staleCount !== 1 ? 'them' : 'it'} with the latest scores.
          </p>
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
                <ReportCardRow key={card.studentId} card={card} onPreview={() => openPreview(card.studentId)} />
              ))}
              {!loading && (!cards || cards.length === 0) && (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-400">
                  {emptyMessage}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
