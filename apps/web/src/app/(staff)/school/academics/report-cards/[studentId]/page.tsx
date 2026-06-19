'use client';

import { Suspense, useState, useCallback, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { staffApi } from '@/lib/api';
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

  const { data, loading, error } = useApi(fetchCard, `${studentId}|${termId}`);
  const { data: school } = useApi(fetchSchool);

  const [downloading, setDownloading] = useState(false);

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
      <style>{`@media print {
        body * { visibility: hidden !important; }
        #report-paper, #report-paper * { visibility: visible !important; }
        #report-paper { position: absolute; left: 0; top: 0; width: 100%; }
      }`}</style>

      {/* Action bar */}
      <div className="flex items-center justify-between mb-5 print:hidden">
        <button onClick={() => router.back()} className="text-sm text-slate-400 hover:text-slate-700 transition flex items-center gap-1">
          ← Back to report cards
        </button>
        <div className="flex items-center gap-2">
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

      {!loading && data && (
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
