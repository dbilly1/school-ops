'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { adminApi } from '@/lib/api';
import { useApi } from '@/hooks/use-api';

type SchoolListItem = {
  id: string; name: string; country: string;
  subscriptionState: string; createdAt: string;
  package: { id: string; name: string } | null;
  _count: { users: number; students: number };
};

const STATE_COLORS: Record<string, { bg: string; color: string }> = {
  ACTIVE:    { bg: '#f0fdf4', color: '#15803d' },
  TRIAL:     { bg: '#eff6ff', color: '#1d4ed8' },
  SUSPENDED: { bg: '#fef2f2', color: '#dc2626' },
  EXPIRED:   { bg: '#f8fafc', color: '#64748b' },
};

export default function AdminSchoolsPage() {
  const [search, setSearch]           = useState('');
  const [stateFilter, setStateFilter] = useState('');

  const fetchSchools = useCallback(() => adminApi.get<SchoolListItem[]>('/super-admin/schools'), []);
  const { data: schools, loading } = useApi(fetchSchools);

  const filtered = schools?.filter(s => {
    const matchesSearch = !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.country.toLowerCase().includes(search.toLowerCase());
    const matchesState  = !stateFilter || s.subscriptionState === stateFilter;
    return matchesSearch && matchesState;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Schools</h1>
          <p className="text-sm text-slate-500 mt-1">
            {schools ? `${schools.length} school${schools.length !== 1 ? 's' : ''} registered` : 'Loading…'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-5">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or country…"
          className="w-72 px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <select
          value={stateFilter}
          onChange={e => setStateFilter(e.target.value)}
          className="px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none"
        >
          <option value="">All states</option>
          <option value="ACTIVE">Active</option>
          <option value="TRIAL">Trial</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="EXPIRED">Expired</option>
        </select>
        {(search || stateFilter) && (
          <button onClick={() => { setSearch(''); setStateFilter(''); }}
            className="text-sm text-slate-400 hover:text-slate-600 transition">
            Clear
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">School</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Package</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Students</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Staff</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Status</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Registered</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} className="border-b border-slate-50">
                <td colSpan={7} className="px-5 py-3.5">
                  <div className="h-8 bg-slate-100 rounded-lg animate-pulse" />
                </td>
              </tr>
            ))}
            {!loading && filtered?.map(school => {
              const cfg = STATE_COLORS[school.subscriptionState] ?? STATE_COLORS.EXPIRED;
              return (
                <tr key={school.id} className="border-b border-slate-50 hover:bg-slate-50/60 transition">
                  <td className="px-5 py-3.5">
                    <p className="text-sm font-medium text-slate-800">{school.name}</p>
                    <p className="text-xs text-slate-400">{school.country}</p>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-slate-600">{school.package?.name ?? <span className="italic text-slate-300">None</span>}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-slate-700">{school._count.students}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-slate-700">{school._count.users}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                      style={{ backgroundColor: cfg.bg, color: cfg.color }}>
                      {school.subscriptionState.charAt(0) + school.subscriptionState.slice(1).toLowerCase()}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-slate-500">
                      {new Date(school.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <Link href={`/admin/schools/${school.id}`}
                      className="text-xs font-medium text-emerald-700 hover:text-emerald-800 transition">
                      Manage →
                    </Link>
                  </td>
                </tr>
              );
            })}
            {!loading && (!filtered || filtered.length === 0) && (
              <tr>
                <td colSpan={7} className="px-5 py-16 text-center text-sm text-slate-400">
                  {search || stateFilter ? 'No schools match your filters.' : 'No schools registered yet.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
