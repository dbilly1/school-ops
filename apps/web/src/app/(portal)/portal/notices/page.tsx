'use client';

import { useCallback } from 'react';
import { portalApi } from '@/lib/api';
import { useApi } from '@/hooks/use-api';

type Notice = {
  id: string;
  title: string;
  body: string;
  publishedAt: string;
};

export default function PortalNoticesPage() {
  const fetchNotices = useCallback(() =>
    portalApi.get<Notice[]>('/portal/notices').catch(() => []), []);
  const { data, loading } = useApi(fetchNotices);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Notices</h1>
        <p className="text-xs text-slate-400 mt-0.5">Notices from your school</p>
      </div>

      {loading && <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-24 bg-slate-100 rounded-xl animate-pulse" />)}</div>}

      {!loading && (!data || data.length === 0) && (
        <div className="bg-white rounded-xl border border-slate-100 px-4 py-12 text-center text-sm text-slate-400">
          No notices at the moment.
        </div>
      )}

      {!loading && data && data.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-2">
          {data.map(notice => (
        <div key={notice.id} className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-4">
          <div className="flex items-start justify-between mb-2">
            <h3 className="text-sm font-semibold text-slate-900 leading-tight flex-1 pr-2">{notice.title}</h3>
            <span className="text-xs text-slate-400 shrink-0">
              {new Date(notice.publishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </span>
          </div>
          <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{notice.body}</p>
        </div>
          ))}
        </div>
      )}
    </div>
  );
}
