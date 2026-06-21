'use client';

import { useState, useCallback } from 'react';
import { portalApi } from '@/lib/api';
import { useApi } from '@/hooks/use-api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

// /portal/report-cards returns the published ReportCard rows with a nested
// term + academicYear (termName/academicYear are NOT flattened).
type ReportCard = {
  id: string;
  termId: string;
  publishedAt: string;
  term: { name: string; academicYear: { name: string } };
};

export default function PortalReportCardsPage() {
  const [downloading, setDownloading] = useState<string | null>(null);

  const fetchCards = useCallback(
    () => portalApi.get<ReportCard[]>('/portal/report-cards').catch(() => []),
    [],
  );
  const { data, loading } = useApi(fetchCards);

  async function downloadPdf(termId: string) {
    setDownloading(termId);
    try {
      const res = await fetch(`${API_BASE}/portal/report-cards/${termId}/pdf`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('so_portal_access')}` },
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `report-card-${termId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // swallow — button re-enables below
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-bold text-slate-900">Report Cards</h1>
        <p className="text-xs text-slate-400 mt-0.5">Download your published report cards</p>
      </header>

      {loading && <div className="space-y-2">{[1, 2].map(i => <div key={i} className="h-20 bg-slate-100 rounded-2xl animate-pulse" />)}</div>}

      {!loading && (!data || data.length === 0) && (
        <div className="bg-white rounded-2xl border border-slate-100 px-4 py-12 text-center">
          <p className="text-2xl mb-3">📄</p>
          <p className="text-sm font-medium text-slate-600">No report cards yet</p>
          <p className="text-xs text-slate-400 mt-1">Published report cards will show up here each term.</p>
        </div>
      )}

      {!loading && data && data.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.map(card => (
        <div key={card.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800 truncate">{card.term.name}</p>
            <p className="text-xs text-slate-400">{card.term.academicYear.name}</p>
            <p className="text-[11px] text-slate-300 mt-0.5">
              Published {new Date(card.publishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          </div>
          <button
            onClick={() => downloadPdf(card.termId)}
            disabled={downloading === card.termId}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white transition disabled:opacity-50 shrink-0"
            style={{ backgroundColor: 'var(--accent)' }}
            onMouseEnter={e => downloading !== card.termId && (e.currentTarget.style.backgroundColor = 'var(--accent-hover)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'var(--accent)')}
          >
            {downloading === card.termId ? 'Downloading…' : '↓ PDF'}
          </button>
        </div>
          ))}
        </div>
      )}
    </div>
  );
}
