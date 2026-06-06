'use client';

import { useState, useCallback } from 'react';
import { portalApi } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { usePortalAuth } from '@/contexts/portal-auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

type ReportCard = {
  termId: string;
  termName: string;
  academicYear: string;
  publishedAt: string;
};

export default function PortalReportCardsPage() {
  const { user } = usePortalAuth();
  const [downloading, setDownloading] = useState<string | null>(null);

  const fetchCards = useCallback(() =>
    portalApi.get<ReportCard[]>('/portal/report-cards').catch(() => []), []);
  const { data, loading } = useApi(fetchCards);

  async function downloadPdf(termId: string) {
    setDownloading(termId);
    try {
      const res = await fetch(`${API_BASE}/portal/report-cards/${termId}/pdf`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('so_portal_access')}` },
      });
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `report-card-${termId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Report Cards</h1>
        <p className="text-xs text-slate-400 mt-0.5">Download your published report cards</p>
      </div>

      {loading && <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />)}</div>}

      {!loading && (!data || data.length === 0) && (
        <div className="bg-white rounded-xl border border-slate-100 px-4 py-12 text-center text-sm text-slate-400">
          No published report cards yet.
        </div>
      )}

      {!loading && data?.map(card => (
        <div key={card.termId} className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-800">{card.termName}</p>
            <p className="text-xs text-slate-400">{card.academicYear}</p>
            <p className="text-xs text-slate-300 mt-0.5">
              Published {new Date(card.publishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          </div>
          <button
            onClick={() => downloadPdf(card.termId)}
            disabled={downloading === card.termId}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white transition disabled:opacity-50"
            style={{ backgroundColor: 'var(--accent)' }}
            onMouseEnter={e => !downloading && (e.currentTarget.style.backgroundColor = 'var(--accent-hover)')}
            onMouseLeave={e => !downloading && (e.currentTarget.style.backgroundColor = 'var(--accent)')}
          >
            {downloading === card.termId ? 'Downloading…' : '↓ PDF'}
          </button>
        </div>
      ))}
    </div>
  );
}
