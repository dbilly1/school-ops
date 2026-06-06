'use client';

import { useState, useCallback } from 'react';
import { portalApi } from '@/lib/api';
import { useApi } from '@/hooks/use-api';

type AttendanceRecord = {
  date: string;
  status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
};

const STATUS_CONFIG = {
  PRESENT: { label: 'Present', color: '#22c55e', bg: '#f0fdf4' },
  LATE:    { label: 'Late',    color: '#f59e0b', bg: '#fffbeb' },
  ABSENT:  { label: 'Absent',  color: '#ef4444', bg: '#fef2f2' },
  EXCUSED: { label: 'Excused', color: '#64748b', bg: '#f8fafc' },
};

export default function PortalAttendancePage() {
  const today      = new Date().toISOString().split('T')[0];
  const monthStart = today.slice(0, 8) + '01';
  const [startDate, setStartDate] = useState(monthStart);
  const [endDate, setEndDate]     = useState(today);

  const fetchAttendance = useCallback(
    () => portalApi.get<AttendanceRecord[]>(`/portal/attendance?startDate=${startDate}&endDate=${endDate}`).catch(() => []),
    [startDate, endDate],
  );
  const { data, loading } = useApi(fetchAttendance);

  const total   = data?.length ?? 0;
  const present = data?.filter(r => r.status === 'PRESENT' || r.status === 'LATE').length ?? 0;
  const absent  = data?.filter(r => r.status === 'ABSENT').length ?? 0;
  const rate    = total > 0 ? Math.round((present / total) * 100) : null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Attendance</h1>
        <p className="text-xs text-slate-400 mt-0.5">Your attendance record</p>
      </div>

      {/* Date range */}
      <div className="flex gap-2">
        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} max={today}
          className="flex-1 px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none"
          onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
          onBlur={e => e.currentTarget.style.boxShadow = ''} />
        <span className="text-slate-400 self-center text-xs">to</span>
        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} max={today}
          className="flex-1 px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none"
          onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
          onBlur={e => e.currentTarget.style.boxShadow = ''} />
      </div>

      {/* Summary */}
      {!loading && total > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3 text-center">
            <p className="text-xs text-slate-400">Attendance rate</p>
            <p className="text-2xl font-bold" style={{ color: rate && rate >= 80 ? '#22c55e' : rate && rate >= 60 ? '#f59e0b' : '#ef4444' }}>
              {rate !== null ? `${rate}%` : '—'}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3 text-center">
            <p className="text-xs text-slate-400">Present</p>
            <p className="text-2xl font-bold text-emerald-600">{present}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3 text-center">
            <p className="text-xs text-slate-400">Absent</p>
            <p className="text-2xl font-bold text-red-500">{absent}</p>
          </div>
        </div>
      )}

      {/* Records */}
      {loading && <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse" />)}</div>}
      {!loading && (
        <div className="space-y-2">
          {data?.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(record => {
            const cfg = STATUS_CONFIG[record.status];
            return (
              <div key={record.date} className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3 flex items-center justify-between">
                <p className="text-sm text-slate-700">
                  {new Date(record.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                  style={{ color: cfg.color, backgroundColor: cfg.bg }}>
                  {cfg.label}
                </span>
              </div>
            );
          })}
          {(!data || data.length === 0) && (
            <div className="bg-white rounded-xl border border-slate-100 px-4 py-10 text-center text-sm text-slate-400">
              No attendance records for this period.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
