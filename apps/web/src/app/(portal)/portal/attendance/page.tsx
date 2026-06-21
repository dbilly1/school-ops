'use client';

import { useState, useCallback } from 'react';
import { portalApi } from '@/lib/api';
import { useApi } from '@/hooks/use-api';

// /portal/attendance returns { records, summary } — not a bare array.
type AttendanceRecord = {
  date: string;
  status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
};
type AttendanceResponse = {
  records: AttendanceRecord[];
  summary: { total: number; present: number; absent: number; rate: number };
};

const EMPTY: AttendanceResponse = { records: [], summary: { total: 0, present: 0, absent: 0, rate: 0 } };

const STATUS_CONFIG: Record<AttendanceRecord['status'], { label: string; color: string; bg: string }> = {
  PRESENT: { label: 'Present', color: '#16a34a', bg: '#f0fdf4' },
  LATE:    { label: 'Late',    color: '#d97706', bg: '#fffbeb' },
  ABSENT:  { label: 'Absent',  color: '#dc2626', bg: '#fef2f2' },
  EXCUSED: { label: 'Excused', color: '#64748b', bg: '#f8fafc' },
};

export default function PortalAttendancePage() {
  const today      = new Date().toISOString().split('T')[0];
  const monthStart = today.slice(0, 8) + '01';
  const [startDate, setStartDate] = useState(monthStart);
  const [endDate, setEndDate]     = useState(today);

  const fetchAttendance = useCallback(
    () => portalApi
      .get<AttendanceResponse>(`/portal/attendance?startDate=${startDate}&endDate=${endDate}`)
      .catch(() => EMPTY),
    [startDate, endDate],
  );
  const { data, loading } = useApi(fetchAttendance, `${startDate}|${endDate}`);

  const summary = data?.summary ?? EMPTY.summary;
  const records = data?.records ?? [];
  const rateColor = summary.rate >= 80 ? '#16a34a' : summary.rate >= 60 ? '#d97706' : '#dc2626';

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-lg font-bold text-slate-900">Attendance</h1>
        <p className="text-xs text-slate-400 mt-0.5">Your attendance record</p>
      </header>

      {/* Date range */}
      <div className="flex items-center gap-2">
        <input type="date" value={startDate} max={endDate} onChange={e => setStartDate(e.target.value)}
          className="flex-1 px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none"
          onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
          onBlur={e => e.currentTarget.style.boxShadow = ''} />
        <span className="text-slate-400 text-xs">to</span>
        <input type="date" value={endDate} max={today} onChange={e => setEndDate(e.target.value)}
          className="flex-1 px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none"
          onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
          onBlur={e => e.currentTarget.style.boxShadow = ''} />
      </div>

      {/* Summary */}
      {!loading && summary.total > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-3 py-4 text-center">
            <p className="text-[11px] text-slate-400">Rate</p>
            <p className="text-2xl font-bold" style={{ color: rateColor }}>{summary.rate}%</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-3 py-4 text-center">
            <p className="text-[11px] text-slate-400">Present</p>
            <p className="text-2xl font-bold text-emerald-600">{summary.present}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-3 py-4 text-center">
            <p className="text-[11px] text-slate-400">Absent</p>
            <p className="text-2xl font-bold text-red-500">{summary.absent}</p>
          </div>
        </div>
      )}

      {/* Records */}
      {loading && (
        <div className="space-y-2">{[1, 2, 3, 4].map(i => <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse" />)}</div>
      )}

      {!loading && records.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 px-4 py-12 text-center">
          <p className="text-2xl mb-3">📅</p>
          <p className="text-sm font-medium text-slate-600">No records for this period</p>
          <p className="text-xs text-slate-400 mt-1">Try widening the date range above.</p>
        </div>
      )}

      {!loading && records.length > 0 && (
        <div className="space-y-2">
          {[...records]
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .map(record => {
              const cfg = STATUS_CONFIG[record.status];
              return (
                <div key={record.date} className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3 flex items-center justify-between">
                  <p className="text-sm text-slate-700">
                    {new Date(record.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ color: cfg.color, backgroundColor: cfg.bg }}>
                    {cfg.label}
                  </span>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
