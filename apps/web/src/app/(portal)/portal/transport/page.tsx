'use client';

import { useCallback } from 'react';
import { portalApi } from '@/lib/api';
import { useApi } from '@/hooks/use-api';

type TransportInfo = {
  route: { name: string; dailyRate: number };
  vehicle: { make: string; model: string; plateNumber: string; capacity: number } | null;
  driver: { name: string; phone: string | null } | null;
  pickupPoints: { name: string; order: number }[];
};

export default function PortalTransportPage() {
  const fetchTransport = useCallback(() =>
    portalApi.get<TransportInfo | null>('/portal/transport').catch(() => null), []);
  const { data, loading } = useApi(fetchTransport);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Transport</h1>
        <p className="text-xs text-slate-400 mt-0.5">Your transport details</p>
      </div>

      {loading && <div className="space-y-3">{[1,2].map(i => <div key={i} className="h-24 bg-slate-100 rounded-xl animate-pulse" />)}</div>}

      {!loading && !data && (
        <div className="bg-white rounded-xl border border-slate-100 px-4 py-12 text-center text-sm text-slate-400">
          You are not assigned to a transport route.
        </div>
      )}

      {!loading && data && (
        <div className="space-y-3">
          {/* Route */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">Route</p>
            <p className="text-base font-bold text-slate-900">{data.route.name}</p>
            <p className="text-sm text-slate-500 mt-0.5">GHS {data.route.dailyRate} per day</p>
          </div>

          {/* Vehicle */}
          {data.vehicle && (
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">Vehicle</p>
              <p className="text-sm font-semibold text-slate-800">
                {data.vehicle.make} {data.vehicle.model}
              </p>
              <p className="text-sm font-mono text-slate-500">{data.vehicle.plateNumber}</p>
              <p className="text-xs text-slate-400 mt-0.5">Capacity: {data.vehicle.capacity} seats</p>
            </div>
          )}

          {/* Driver */}
          {data.driver && (
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">Driver</p>
              <p className="text-sm font-semibold text-slate-800">{data.driver.name}</p>
              {data.driver.phone && (
                <a href={`tel:${data.driver.phone}`} className="text-sm font-medium" style={{ color: 'var(--accent)' }}>
                  {data.driver.phone}
                </a>
              )}
            </div>
          )}

          {/* Pickup points */}
          {data.pickupPoints.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">Pickup stops</p>
              <div className="space-y-2">
                {data.pickupPoints.sort((a,b) => a.order - b.order).map((pt, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
                      style={{ backgroundColor: 'var(--accent)' }}
                    >
                      {i + 1}
                    </div>
                    <span className="text-sm text-slate-700">{pt.name}</span>
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
