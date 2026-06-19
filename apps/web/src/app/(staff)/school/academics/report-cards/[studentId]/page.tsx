'use client';

import { Suspense, useState, useCallback, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { staffApi, type ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { ReportCardDocument, type ReportCardData, type SchoolHeader } from '@/components/report-cards/report-card-document';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

export default function ReportCardPreviewPage({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = use(params);
  return (
    <Suspense fallback={<div className="h-[600px] bg-slate-100 rounded-2xl animate-pulse" />}>
      <PreviewInner studentId={studentId} />
    </Suspense>
  );
}

function PreviewInner({ studentId }: { studentId: string }) {
  const router = useRouter();
  const termId = useSearchParams().get('termId') ?? '';

  const fetchCard = useCallback(
    () => staffApi.get<ReportCardData>(`/school/report-cards/student/${studentId}?termId=${termId}`),
    [studentId, termId],
  );
  const fetchSchool = useCallback(() => staffApi.get<SchoolHeader>('/school/profile'), []);

  const { data, loading, error, refetch } = useApi(fetchCard, `${studentId}|${termId}`);
  const { data: school } = useApi(fetchSchool);

  const [downloading, setDownloading] = useState(false);
  const [editing, setEditing] = useState(false);

  async function downloadPdf() {
    setDownloading(true);
    try {
      const res = await fetch(`${API_BASE}/school/report-cards/student/${studentId}/pdf?termId=${termId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('so_staff_access')}` },
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report-card-${data?.student.studentId ?? studentId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div>
      {/* Print rule: show only the report sheet when printing */}
      <style>{`
      /* margin: 0 makes the browser drop its injected header/footer (page URL,
         title, date) — the report supplies its own padding/bands. */
      @page { size: A4; margin: 0; }
      @media print {
        body * { visibility: hidden !important; }
        #report-paper, #report-paper * {
          visibility: visible !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        #report-paper { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none !important; }
        /* Keep whole components together — never split a table/section across pages. */
        #report-paper table, #report-paper tr { break-inside: avoid; }
        #report-paper h3 { break-after: avoid; }
      }`}</style>

      {/* Action bar */}
      <div className="flex items-center justify-between mb-5 print:hidden">
        <button onClick={() => router.back()} className="text-sm text-slate-400 hover:text-slate-700 transition flex items-center gap-1">
          ← Back to report cards
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditing(v => !v)}
            disabled={!data}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
          >
            {editing ? 'Close editor' : '✎ Edit details'}
          </button>
          <button
            onClick={() => window.print()}
            disabled={!data}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
          >
            🖨 Print
          </button>
          <button
            onClick={downloadPdf}
            disabled={!data || downloading}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition disabled:opacity-50"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            {downloading ? 'Downloading…' : '↓ Download PDF'}
          </button>
        </div>
      </div>

      {loading && <div className="h-[600px] bg-slate-100 rounded-2xl animate-pulse" />}
      {!loading && error && (
        <div className="bg-white rounded-2xl border border-slate-100 px-6 py-16 text-center text-sm text-red-500">
          Could not load this report card. {error.message}
        </div>
      )}

      {!loading && data && editing && (
        <ReportCardEditor
          data={data}
          studentId={studentId}
          termId={termId}
          onSaved={() => { refetch(); setEditing(false); }}
        />
      )}

      {!loading && data && !editing && (
        <div className="bg-slate-100 rounded-2xl p-4 sm:p-8">
          {data.publishedAt ? (
            <p className="mb-3 text-center text-xs font-medium text-emerald-600 print:hidden">● Published</p>
          ) : (
            <p className="mb-3 text-center text-xs font-medium text-amber-500 print:hidden">● Draft preview — not yet published</p>
          )}
          <div id="report-paper" className="rounded-xl shadow-sm overflow-hidden">
            <ReportCardDocument data={data} school={school ?? { name: '' }} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Per-student editor: remarks, conduct, promotion, holistic ratings ─────────

function ReportCardEditor({ data, studentId, termId, onSaved }: {
  data: ReportCardData; studentId: string; termId: string; onSaved: () => void;
}) {
  const c = data.conduct;
  const [form, setForm] = useState({
    teacherRemarks: c?.teacherRemarks ?? '',
    headTeacherRemarks: c?.headTeacherRemarks ?? '',
    attitudes: c?.attitudes ?? '',
    interests: c?.interests ?? '',
    conduct: c?.conduct ?? '',
    promotedTo: c?.promotedTo ?? '',
  });
  const [ratings, setRatings] = useState<Record<string, string>>(data.holistic ?? {});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const scale = data.assessmentScale;
  const showHolistic = (data.config?.showAssessmentScale ?? false) && !!scale && scale.levels.length > 0 && scale.skills.length > 0;

  function setRating(skillId: string, code: string) {
    setRatings(r => ({ ...r, [skillId]: r[skillId] === code ? '' : code }));
  }

  async function save() {
    setErr(null); setSaving(true);
    try {
      await staffApi.patch(`/school/report-cards/student/${studentId}?termId=${termId}`, {
        teacherRemarks: form.teacherRemarks,
        headTeacherRemarks: form.headTeacherRemarks,
        attitudes: form.attitudes,
        interests: form.interests,
        conduct: form.conduct,
        promotedTo: form.promotedTo,
        ...(showHolistic ? { holistic: ratings } : {}),
      });
      onSaved();
    } catch (e) {
      setErr((e as ApiError).message ?? 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  const field = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));
  const inputCls = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none';

  return (
    <div className="mb-5 bg-white rounded-2xl border border-slate-100 shadow-sm p-5 print:hidden">
      <h3 className="text-base font-bold text-slate-900 mb-4">Edit report card details</h3>
      {err && <p className="mb-3 text-sm text-red-500">{err}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Class teacher’s comments</label>
          <textarea rows={3} value={form.teacherRemarks} onChange={field('teacherRemarks')} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Head teacher’s comments</label>
          <textarea rows={3} value={form.headTeacherRemarks} onChange={field('headTeacherRemarks')} className={inputCls} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Attitudes</label>
          <input value={form.attitudes} onChange={field('attitudes')} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Interests</label>
          <input value={form.interests} onChange={field('interests')} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Conduct</label>
          <input value={form.conduct} onChange={field('conduct')} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Promoted to</label>
          <input value={form.promotedTo} onChange={field('promotedTo')} className={inputCls} placeholder="e.g. Year 5" />
        </div>
      </div>

      {showHolistic && scale && (
        <div className="mb-4">
          <label className="block text-xs font-medium text-slate-500 mb-2">Holistic Development ratings</label>
          <div className="space-y-2">
            {scale.skills.map(sk => (
              <div key={sk.id} className="flex items-center justify-between gap-3 flex-wrap">
                <span className="text-sm text-slate-700 flex-1 min-w-[200px]">{sk.label}</span>
                <div className="flex gap-1.5">
                  {scale.levels.map(l => {
                    const on = ratings[sk.id] === l.code;
                    return (
                      <button key={l.id} type="button" onClick={() => setRating(sk.id, l.code)} title={l.label}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${on ? 'border-transparent text-white' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                        style={on ? { backgroundColor: 'var(--accent)' } : {}}>
                        {l.code}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button onClick={save} disabled={saving}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition disabled:opacity-50"
          style={{ backgroundColor: 'var(--accent)' }}>
          {saving ? 'Saving…' : 'Save details'}
        </button>
      </div>
    </div>
  );
}
