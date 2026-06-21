'use client';

import { useCallback } from 'react';
import { portalApi } from '@/lib/api';
import { useApi } from '@/hooks/use-api';

// /portal/transport returns the StudentTransportAssignment with a nested
// transportRoute (route + vehicle + driver + pickupPoints), or null.
type Transport = {
  transportRoute: {
    name: string;
    dailyRate: number | string;
    vehicle: { plateNumber: string; model: string | null } | null;
    driver: { name: string; phone: string | null } | null;
    pickupPoints: { name: string; sequence: number }[];
  };
} | null;

export default function PortalTransportPage() {
  const fetchTransport = useCallback(
    () => portalApi.get<Transport>('/portal/transport').catch(() => null),
    [],
  );
  const { data, loading } = useApi(fetchTransport);

  const route = data?.transportRoute ?? null;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-bold text-slate-900">Transport</h1>
        <p className="text-xs text-slate-400 mt-0.5">Your route, bus and pickup details</p>
      </header>

      {loading && <div className="space-y-3">{[1, 2].map(i => <div key={i} className="h-24 bg-slate-100 rounded-2xl animate-pulse" />)}</div>}

      {!loading && !route && (
        <div className="bg-white rounded-2xl border border-slate-100 px-4 py-12 text-center">
          <p className="text-2xl mb-3">🚌</p>
          <p className="text-sm font-medium text-slate-600">No transport route</p>
          <p className="text-xs text-slate-400 mt-1">You’re not assigned to a school bus route.</p>
        </div>
      )}

      {!loading && route && (
        <div className="space-y-3">
          {/* Route header card */}
          <div className="rounded-2xl px-5 py-5 text-white" style={{ backgroundColor: 'var(--accent)' }}>
            <p className="text-xs font-medium uppercase tracking-widest opacity-70">Route</p>
            <p className="text-xl font-bold mt-1">{route.name}</p>
            <p className="text-sm opacity-80 mt-0.5">GHS {Number(route.dailyRate)} per day</p>
          </div>

          {/* Vehicle + driver — side by side on larger screens */}
          {(route.vehicle || route.driver) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {route.vehicle && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">Vehicle</p>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-800">{route.vehicle.model ?? 'School bus'}</p>
                    <p className="text-sm font-mono text-slate-500">{route.vehicle.plateNumber}</p>
                  </div>
                </div>
              )}
              {route.driver && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">Driver</p>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-800">{route.driver.name}</p>
                    {route.driver.phone && (
                      <a href={`tel:${route.driver.phone}`} className="text-sm font-medium" style={{ color: 'var(--accent)' }}>
                        {route.driver.phone}
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Pickup points */}
          {route.pickupPoints.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">Pickup stops</p>
              <div className="space-y-1">
                {[...route.pickupPoints].sort((a, b) => a.sequence - b.sequence).map((pt, i, arr) => (
                  <div key={`${pt.name}-${pt.sequence}`} className="flex items-stretch gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0" style={{ backgroundColor: 'var(--accent)' }}>
                        {i + 1}
                      </div>
                      {i < arr.length - 1 && <div className="w-px flex-1 bg-slate-200 my-0.5" />}
                    </div>
                    <span className="text-sm text-slate-700 pt-0.5 pb-2">{pt.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
