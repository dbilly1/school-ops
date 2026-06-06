'use client';

import { useCallback } from 'react';
import { portalApi } from '@/lib/api';
import { useApi } from '@/hooks/use-api';

type FeedingBalance =
  | { enrolled: false }
  | { enrolled: true; daysRemaining: number };

export default function PortalFeedingPage() {
  const fetchBalance = useCallback(
    () => portalApi.get<FeedingBalance>('/portal/feeding').catch(() => ({ enrolled: false } as FeedingBalance)),
    [],
  );
  const { data, loading } = useApi(fetchBalance);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Feeding</h1>
        <p className="text-xs text-slate-400 mt-0.5">Your feeding balance and status</p>
      </div>

      {loading && (
        <div className="space-y-3">
          <div className="h-32 bg-slate-100 rounded-2xl animate-pulse" />
          <div className="h-20 bg-slate-100 rounded-2xl animate-pulse" />
        </div>
      )}

      {!loading && data && !data.enrolled && (
        <div className="bg-white rounded-2xl border border-slate-100 px-4 py-12 text-center">
          <p className="text-2xl mb-3">🍽</p>
          <p className="text-sm font-medium text-slate-600">Not enrolled in feeding</p>
          <p className="text-xs text-slate-400 mt-1">Contact your school if this is unexpected.</p>
        </div>
      )}

      {!loading && data?.enrolled && (
        <div className="space-y-3">
          {/* Balance card */}
          <div
            className="rounded-2xl px-6 py-8 text-white text-center"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            <p className="text-sm font-medium opacity-80 mb-1">Days remaining</p>
            <p className="text-6xl font-bold tracking-tight">
              {(data as { enrolled: true; daysRemaining: number }).daysRemaining}
            </p>
            <p className="text-sm opacity-70 mt-2">pre-paid school days covered</p>
          </div>

          {/* Status info */}
          {(() => {
            const days = (data as { enrolled: true; daysRemaining: number }).daysRemaining;
            if (days === 0) {
              return (
                <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 flex items-start gap-3">
                  <span className="text-red-500 text-lg leading-none mt-0.5">⚠</span>
                  <div>
                    <p className="text-sm font-semibold text-red-700">No days remaining</p>
                    <p className="text-xs text-red-500 mt-0.5">
                      Please make a payment to continue feeding coverage.
                    </p>
                  </div>
                </div>
              );
            }
            if (days <= 3) {
              return (
                <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 flex items-start gap-3">
                  <span className="text-amber-500 text-lg leading-none mt-0.5">⚠</span>
                  <div>
                    <p className="text-sm font-semibold text-amber-700">Running low</p>
                    <p className="text-xs text-amber-600 mt-0.5">
                      Only {days} day{days !== 1 ? 's' : ''} left. Consider topping up soon.
                    </p>
                  </div>
                </div>
              );
            }
            return (
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 flex items-center gap-3">
                <span className="text-emerald-500 text-lg leading-none">✓</span>
                <p className="text-sm font-medium text-emerald-700">
                  You're covered for the next {days} school day{days !== 1 ? 's' : ''}.
                </p>
              </div>
            );
          })()}

          {/* Info note */}
          <div className="bg-white rounded-xl border border-slate-100 px-4 py-3">
            <p className="text-xs text-slate-500 leading-relaxed">
              Pre-paid days are automatically applied each school day you attend.
              Absent days are not deducted. Contact your class teacher or accountant to make a top-up payment.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
