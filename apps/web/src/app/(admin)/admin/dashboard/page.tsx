'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import {
  School,
  CheckCircle2,
  GraduationCap,
  Users,
  AlertTriangle,
  Clock,
  Ban,
  TriangleAlert,
} from 'lucide-react';
import { adminApi } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import type { LucideIcon } from 'lucide-react';

type DashboardData = {
  schools: { total: number; active: number; trial: number; suspended: number; expired: number };
  totalStudents: number;
  totalStaffUsers: number;
  packageDistribution: { packageId: string | null; packageName: string; count: number }[];
  recentSignups: {
    id: string; name: string; country: string; subscriptionState: string;
    createdAt: string; package: { name: string } | null;
    _count: { users: number; students: number };
  }[];
};

const STATE_COLORS: Record<string, { bg: string; color: string }> = {
  ACTIVE:    { bg: '#f0fdf4', color: '#15803d' },
  TRIAL:     { bg: '#eff6ff', color: '#1d4ed8' },
  SUSPENDED: { bg: '#fef2f2', color: '#dc2626' },
  EXPIRED:   { bg: '#f8fafc', color: '#64748b' },
};

function StatCard({
  label, value, sub, Icon,
}: {
  label: string; value: number | string; sub?: string; Icon: LucideIcon;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-5 flex items-start gap-4">
      <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center shrink-0">
        <Icon size={18} className="text-slate-500" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1">{label}</p>
        <p className="text-3xl font-bold text-slate-900">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function StateChip({
  label, value, state, Icon,
}: {
  label: string; value: number; state: string; Icon: LucideIcon;
}) {
  const cfg = STATE_COLORS[state] ?? STATE_COLORS.EXPIRED;
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-4 flex items-center gap-3">
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
        style={{ backgroundColor: cfg.bg }}
      >
        <Icon size={16} style={{ color: cfg.color }} />
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-700">{label}</p>
        <p className="text-lg font-bold" style={{ color: cfg.color }}>{value}</p>
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  const fetchDashboard = useCallback(
    () => adminApi.get<DashboardData>('/super-admin/analytics/dashboard'),
    [],
  );
  const { data, loading, error: apiError } = useApi(fetchDashboard);

  const error   = apiError?.message ?? (apiError ? 'An unexpected error occurred.' : null);
  const isEmpty = data && data.schools.total === 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Platform Overview</h1>
        <p className="text-sm text-slate-500 mt-1">Live stats across all tenants.</p>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-28 bg-slate-100 rounded-2xl animate-pulse" />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 bg-slate-100 rounded-2xl animate-pulse" />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div className="h-60 bg-slate-100 rounded-2xl animate-pulse" />
            <div className="h-60 bg-slate-100 rounded-2xl animate-pulse" />
          </div>
        </div>
      )}

      {/* API error */}
      {!loading && error && (
        <div className="bg-red-50 border border-red-100 rounded-2xl px-6 py-8 flex flex-col items-center gap-2 text-center">
          <AlertTriangle size={24} className="text-red-400" />
          <p className="text-sm font-semibold text-red-700">Failed to load dashboard</p>
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Empty platform — no schools yet */}
      {!loading && !error && isEmpty && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-6 py-16 flex flex-col items-center gap-3 text-center">
          <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center">
            <School size={22} className="text-slate-400" />
          </div>
          <p className="text-base font-semibold text-slate-700">No schools yet</p>
          <p className="text-sm text-slate-400">
            Once schools sign up, stats will appear here.
          </p>
        </div>
      )}

      {/* Data */}
      {!loading && !error && data && !isEmpty && (
        <>
          {/* Top stats */}
          <div className="grid grid-cols-4 gap-4">
            <StatCard label="Total schools"  value={data.schools.total}                    Icon={School} />
            <StatCard label="Active"         value={data.schools.active}                   Icon={CheckCircle2} sub={`${data.schools.trial} on trial`} />
            <StatCard label="Total students" value={data.totalStudents.toLocaleString()}   Icon={GraduationCap} />
            <StatCard label="Staff users"    value={data.totalStaffUsers.toLocaleString()} Icon={Users} />
          </div>

          {/* State breakdown */}
          <div className="grid grid-cols-3 gap-4">
            <StateChip label="Trial"     value={data.schools.trial}     state="TRIAL"     Icon={Clock} />
            <StateChip label="Suspended" value={data.schools.suspended} state="SUSPENDED" Icon={Ban} />
            <StateChip label="Expired"   value={data.schools.expired}   state="EXPIRED"   Icon={TriangleAlert} />
          </div>

          {/* Lower panels */}
          <div className="grid grid-cols-2 gap-6">
            {/* Package distribution */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-50">
                <p className="text-sm font-semibold text-slate-700">Package distribution</p>
              </div>
              <div className="divide-y divide-slate-50">
                {data.packageDistribution.length === 0 ? (
                  <div className="px-5 py-10 text-center text-sm text-slate-400">
                    No packages configured yet.
                  </div>
                ) : (
                  data.packageDistribution.map(pkg => {
                    const pct = data.schools.total
                      ? Math.round((pkg.count / data.schools.total) * 100)
                      : 0;
                    return (
                      <div key={pkg.packageId ?? 'none'} className="px-5 py-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <p className="text-sm text-slate-700">{pkg.packageName}</p>
                          <span className="text-sm font-bold text-slate-900">
                            {pkg.count}
                            <span className="text-xs font-normal text-slate-400 ml-1">
                              ({pct}%)
                            </span>
                          </span>
                        </div>
                        <div className="h-1 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-emerald-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Recent signups */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-50 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">Recent signups</p>
                <Link
                  href="/admin/schools"
                  className="text-xs font-medium text-emerald-700 hover:text-emerald-800"
                >
                  View all →
                </Link>
              </div>
              <div className="divide-y divide-slate-50">
                {data.recentSignups.length === 0 ? (
                  <div className="px-5 py-10 text-center text-sm text-slate-400">
                    No recent signups.
                  </div>
                ) : (
                  data.recentSignups.map(school => {
                    const cfg = STATE_COLORS[school.subscriptionState] ?? STATE_COLORS.EXPIRED;
                    return (
                      <Link
                        key={school.id}
                        href={`/admin/schools/${school.id}`}
                        className="px-5 py-3 flex items-center justify-between hover:bg-slate-50 transition"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">
                            {school.name}
                          </p>
                          <p className="text-xs text-slate-400">
                            {school.country} · {school.package?.name ?? 'No package'}
                          </p>
                        </div>
                        <span
                          className="text-xs font-semibold px-2 py-0.5 rounded-full ml-3 shrink-0"
                          style={{ backgroundColor: cfg.bg, color: cfg.color }}
                        >
                          {school.subscriptionState.charAt(0) +
                            school.subscriptionState.slice(1).toLowerCase()}
                        </span>
                      </Link>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
