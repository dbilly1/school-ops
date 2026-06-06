'use client';

import { useState, useCallback } from 'react';
import { staffApi } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { cn } from '@/lib/cn';

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'enrollment' | 'attendance' | 'academics' | 'fees' | 'transport' | 'feeding';

type EnrollmentData = {
  totalStudents: number;
  byClass: { className: string; count: number }[];
  byGrade: { gradeName: string; count: number }[];
};

type AttendanceData = {
  classId: string; className: string;
  presentRate: number; absentRate: number; lateRate: number;
  totalDays: number;
}[];

type AcademicsData = {
  classId: string; className: string; subjectName: string;
  avgScore: number; highScore: number; lowScore: number; studentCount: number;
}[];

type FeesData = {
  totalBilled: number; totalPaid: number; totalOutstanding: number;
  byClass: { className: string; billed: number; paid: number; outstanding: number }[];
};

type TransportData = {
  routeName: string; studentCount: number; dailyRate: number;
}[];

type FeedingData = {
  date: string; paidCount: number; preCoveredCount: number;
  absentCount: number; unpaidCount: number; cashCollected: number;
}[];

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-5 py-4">
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color ?? 'text-slate-800'}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">{title}</h3>
  );
}

// ── Enrollment report ─────────────────────────────────────────────────────────

function EnrollmentReport() {
  const [academicYearId, setAcademicYearId] = useState('');
  const fetchYears = useCallback(() => staffApi.get<any[]>('/school/academic-years'), []);
  const { data: years } = useApi(fetchYears);

  const activeYear = years?.find(y => y.isActive) ?? years?.[0];
  const yearId     = academicYearId || activeYear?.id || '';

  const fetchReport = useCallback(
    () => yearId ? staffApi.get<EnrollmentData>(`/school/reports/enrollment?academicYearId=${yearId}`).catch(() => null) : Promise.resolve(null),
    [yearId],
  );
  const { data, loading } = useApi(fetchReport);

  return (
    <div>
      <div className="flex gap-3 mb-5">
        <select value={yearId} onChange={e => setAcademicYearId(e.target.value)}
          className="px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none">
          <option value="">Select year…</option>
          {years?.map((y: any) => <option key={y.id} value={y.id}>{y.name}{y.isActive ? ' (Active)' : ''}</option>)}
        </select>
      </div>

      {loading && <div className="h-48 bg-slate-100 rounded-2xl animate-pulse" />}
      {!loading && data && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard label="Total students" value={data.totalStudents} color="text-slate-800" />
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <SectionHeader title="By Grade Level" />
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                <table className="w-full">
                  <thead><tr className="border-b border-slate-50 bg-slate-50">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400">Grade</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-400">Students</th>
                  </tr></thead>
                  <tbody>
                    {data.byGrade.map(g => (
                      <tr key={g.gradeName} className="border-b border-slate-50 last:border-0">
                        <td className="px-4 py-2.5 text-sm text-slate-700">{g.gradeName}</td>
                        <td className="px-4 py-2.5 text-sm font-medium text-slate-800 text-right">{g.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <SectionHeader title="By Class" />
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                <table className="w-full">
                  <thead><tr className="border-b border-slate-50 bg-slate-50">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400">Class</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-400">Students</th>
                  </tr></thead>
                  <tbody>
                    {data.byClass.map(c => (
                      <tr key={c.className} className="border-b border-slate-50 last:border-0">
                        <td className="px-4 py-2.5 text-sm text-slate-700">{c.className}</td>
                        <td className="px-4 py-2.5 text-sm font-medium text-slate-800 text-right">{c.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
      {!loading && !data && (
        <p className="text-sm text-slate-400 text-center py-12">Select an academic year to view enrollment data.</p>
      )}
    </div>
  );
}

// ── Attendance report ─────────────────────────────────────────────────────────

function AttendanceReport() {
  const today = new Date().toISOString().split('T')[0];
  const monthStart = today.slice(0, 8) + '01';
  const [startDate, setStartDate] = useState(monthStart);
  const [endDate, setEndDate]     = useState(today);
  const [classId, setClassId]     = useState('');

  const fetchClasses = useCallback(() => staffApi.get<{ id: string; name: string }[]>('/school/grade-structure/classes'), []);
  const { data: classes } = useApi(fetchClasses);

  const fetchReport = useCallback(() => {
    const params = new URLSearchParams({ startDate, endDate });
    if (classId) params.set('classId', classId);
    return staffApi.get<AttendanceData>(`/school/reports/attendance?${params}`).catch(() => []);
  }, [startDate, endDate, classId]);

  const { data, loading } = useApi(fetchReport);

  function rateColor(rate: number) {
    if (rate >= 90) return 'text-emerald-600';
    if (rate >= 75) return 'text-amber-600';
    return 'text-red-500';
  }

  return (
    <div>
      <div className="flex gap-3 mb-5 flex-wrap">
        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
          className="px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none"
          onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
          onBlur={e => e.currentTarget.style.boxShadow = ''} />
        <span className="text-slate-400 self-center">to</span>
        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
          className="px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none"
          onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
          onBlur={e => e.currentTarget.style.boxShadow = ''} />
        <select value={classId} onChange={e => setClassId(e.target.value)}
          className="px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none">
          <option value="">All classes</option>
          {classes?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {loading && <div className="h-48 bg-slate-100 rounded-2xl animate-pulse" />}
      {!loading && data && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead><tr className="border-b border-slate-100 bg-slate-50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Class</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">Present %</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">Absent %</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">Late %</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">Days tracked</th>
            </tr></thead>
            <tbody>
              {data.map(row => (
                <tr key={row.classId} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/40 transition">
                  <td className="px-4 py-3 text-sm font-medium text-slate-800">{row.className}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-sm font-bold ${rateColor(row.presentRate)}`}>{row.presentRate}%</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-sm text-red-400">{row.absentRate}%</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-sm text-amber-500">{row.lateRate}%</span>
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-slate-500">{row.totalDays}</td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-slate-400">No attendance data for this period.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Academics report ──────────────────────────────────────────────────────────

function AcademicsReport() {
  const [termId, setTermId]   = useState('');
  const [classId, setClassId] = useState('');

  const fetchTerms   = useCallback(() => staffApi.get<any>('/school/academic-years/active').then(y => y?.terms ?? []).catch(() => []), []);
  const fetchClasses = useCallback(() => staffApi.get<{ id: string; name: string }[]>('/school/grade-structure/classes'), []);
  const { data: terms }   = useApi(fetchTerms);
  const { data: classes } = useApi(fetchClasses);

  const activeTermId = termId || terms?.find((t: any) => t.isActive)?.id || '';

  const fetchReport = useCallback(() => {
    if (!activeTermId) return Promise.resolve([]);
    const params = new URLSearchParams({ termId: activeTermId });
    if (classId) params.set('classId', classId);
    return staffApi.get<AcademicsData>(`/school/reports/academics?${params}`).catch(() => []);
  }, [activeTermId, classId]);

  const { data, loading } = useApi(fetchReport);

  function scoreColor(score: number) {
    if (score >= 70) return 'text-emerald-600';
    if (score >= 50) return 'text-amber-600';
    return 'text-red-500';
  }

  return (
    <div>
      <div className="flex gap-3 mb-5">
        <select value={activeTermId} onChange={e => setTermId(e.target.value)}
          className="px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none">
          <option value="">Select term…</option>
          {terms?.map((t: any) => <option key={t.id} value={t.id}>{t.name}{t.isActive ? ' ✓' : ''}</option>)}
        </select>
        <select value={classId} onChange={e => setClassId(e.target.value)}
          className="px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none">
          <option value="">All classes</option>
          {classes?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {loading && <div className="h-48 bg-slate-100 rounded-2xl animate-pulse" />}
      {!loading && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead><tr className="border-b border-slate-100 bg-slate-50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Class</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Subject</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">Avg</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">High</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">Low</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">Students</th>
            </tr></thead>
            <tbody>
              {data?.map((row, i) => (
                <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/40 transition">
                  <td className="px-4 py-3 text-sm font-medium text-slate-800">{row.className}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{row.subjectName}</td>
                  <td className="px-4 py-3 text-center"><span className={`text-sm font-bold ${scoreColor(row.avgScore)}`}>{row.avgScore}%</span></td>
                  <td className="px-4 py-3 text-center text-sm text-emerald-600">{row.highScore}</td>
                  <td className="px-4 py-3 text-center text-sm text-red-400">{row.lowScore}</td>
                  <td className="px-4 py-3 text-center text-sm text-slate-500">{row.studentCount}</td>
                </tr>
              ))}
              {(!data || data.length === 0) && (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-400">
                  {activeTermId ? 'No academic data for this term.' : 'Select a term to view the report.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Fee balances report ───────────────────────────────────────────────────────

function FeesReport() {
  const [termId, setTermId] = useState('');
  const fetchTerms = useCallback(() => staffApi.get<any>('/school/academic-years/active').then(y => y?.terms ?? []).catch(() => []), []);
  const { data: terms } = useApi(fetchTerms);
  const activeTermId = termId || terms?.find((t: any) => t.isActive)?.id || '';

  const fetchReport = useCallback(
    () => activeTermId ? staffApi.get<FeesData>(`/school/reports/fee-balances?termId=${activeTermId}`).catch(() => null) : Promise.resolve(null),
    [activeTermId],
  );
  const { data, loading } = useApi(fetchReport);

  return (
    <div>
      <div className="flex gap-3 mb-5">
        <select value={activeTermId} onChange={e => setTermId(e.target.value)}
          className="px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none">
          <option value="">Select term…</option>
          {terms?.map((t: any) => <option key={t.id} value={t.id}>{t.name}{t.isActive ? ' ✓' : ''}</option>)}
        </select>
      </div>

      {loading && <div className="h-48 bg-slate-100 rounded-2xl animate-pulse" />}
      {!loading && data && (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-4">
            <StatCard label="Total billed" value={`GHS ${data.totalBilled.toLocaleString('en-GH', { minimumFractionDigits: 2 })}`} />
            <StatCard label="Total paid" value={`GHS ${data.totalPaid.toLocaleString('en-GH', { minimumFractionDigits: 2 })}`} color="text-emerald-600" />
            <StatCard label="Outstanding" value={`GHS ${data.totalOutstanding.toLocaleString('en-GH', { minimumFractionDigits: 2 })}`} color="text-red-500" />
          </div>

          {data.byClass.length > 0 && (
            <div>
              <SectionHeader title="By Class" />
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                <table className="w-full">
                  <thead><tr className="border-b border-slate-50 bg-slate-50">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400">Class</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-400">Billed</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-400">Paid</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-400">Outstanding</th>
                  </tr></thead>
                  <tbody>
                    {data.byClass.map(c => (
                      <tr key={c.className} className="border-b border-slate-50 last:border-0">
                        <td className="px-4 py-2.5 text-sm text-slate-700">{c.className}</td>
                        <td className="px-4 py-2.5 text-sm text-slate-600 text-right">{c.billed.toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-sm text-emerald-600 text-right">{c.paid.toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-sm font-medium text-right" style={{ color: c.outstanding > 0 ? '#ef4444' : '#94a3b8' }}>
                          {c.outstanding.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
      {!loading && !data && (
        <p className="text-sm text-slate-400 text-center py-12">Select a term to view the fee report.</p>
      )}
    </div>
  );
}

// ── Transport report ──────────────────────────────────────────────────────────

function TransportReport() {
  const fetchReport = useCallback(() => staffApi.get<TransportData>('/school/reports/transport').catch(() => []), []);
  const { data, loading } = useApi(fetchReport);

  const totalStudents = data?.reduce((sum, r) => sum + r.studentCount, 0) ?? 0;
  const totalRevenue  = data?.reduce((sum, r) => sum + (r.studentCount * r.dailyRate), 0) ?? 0;

  return (
    <div>
      {loading && <div className="h-48 bg-slate-100 rounded-2xl animate-pulse" />}
      {!loading && data && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <StatCard label="Students on transport" value={totalStudents} />
            <StatCard label="Daily revenue" value={`GHS ${totalRevenue.toFixed(2)}`} color="text-emerald-600" />
          </div>
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <table className="w-full">
              <thead><tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Route</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">Students</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide">Daily rate</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide">Daily total</th>
              </tr></thead>
              <tbody>
                {data.map(row => (
                  <tr key={row.routeName} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-3 text-sm font-medium text-slate-800">{row.routeName}</td>
                    <td className="px-4 py-3 text-center text-sm text-slate-600">{row.studentCount}</td>
                    <td className="px-4 py-3 text-right text-sm text-slate-600">GHS {row.dailyRate}</td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-emerald-600">GHS {(row.studentCount * row.dailyRate).toFixed(2)}</td>
                  </tr>
                ))}
                {data.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-12 text-center text-sm text-slate-400">No transport data.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Feeding report ────────────────────────────────────────────────────────────

function FeedingReport() {
  const today      = new Date().toISOString().split('T')[0];
  const monthStart = today.slice(0, 8) + '01';
  const [startDate, setStartDate] = useState(monthStart);
  const [endDate, setEndDate]     = useState(today);

  const fetchReport = useCallback(
    () => staffApi.get<FeedingData>(`/school/reports/feeding?startDate=${startDate}&endDate=${endDate}`).catch(() => []),
    [startDate, endDate],
  );
  const { data, loading } = useApi(fetchReport);

  const totalCash = data?.reduce((sum, d) => sum + d.cashCollected, 0) ?? 0;

  return (
    <div>
      <div className="flex gap-3 mb-5 items-center">
        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
          className="px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none"
          onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
          onBlur={e => e.currentTarget.style.boxShadow = ''} />
        <span className="text-slate-400">to</span>
        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
          className="px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none"
          onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
          onBlur={e => e.currentTarget.style.boxShadow = ''} />
      </div>

      {loading && <div className="h-48 bg-slate-100 rounded-2xl animate-pulse" />}
      {!loading && data && (
        <div className="space-y-4">
          <StatCard label="Total cash collected" value={`GHS ${totalCash.toFixed(2)}`} color="text-emerald-600"
            sub={`Over ${data.length} school day${data.length !== 1 ? 's' : ''}`} />
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <table className="w-full">
              <thead><tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Date</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">Paid</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">Pre-covered</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">Absent</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">Unpaid</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide">Cash</th>
              </tr></thead>
              <tbody>
                {data.map(row => (
                  <tr key={row.date} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/40 transition">
                    <td className="px-4 py-2.5 text-sm text-slate-700">
                      {new Date(row.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </td>
                    <td className="px-4 py-2.5 text-center text-sm text-emerald-600">{row.paidCount}</td>
                    <td className="px-4 py-2.5 text-center text-sm text-blue-500">{row.preCoveredCount}</td>
                    <td className="px-4 py-2.5 text-center text-sm text-slate-400">{row.absentCount}</td>
                    <td className="px-4 py-2.5 text-center text-sm text-red-400">{row.unpaidCount}</td>
                    <td className="px-4 py-2.5 text-right text-sm font-semibold text-slate-800">GHS {row.cashCollected.toFixed(2)}</td>
                  </tr>
                ))}
                {data.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-400">No data for this period.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const TABS: [Tab, string][] = [
  ['enrollment', 'Enrollment'],
  ['attendance', 'Attendance'],
  ['academics',  'Academics'],
  ['fees',       'Fees'],
  ['transport',  'Transport'],
  ['feeding',    'Feeding'],
];

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>('enrollment');

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">Reports</h1>
        <p className="text-sm text-slate-500 mt-0.5">School-wide analytics and summaries.</p>
      </div>

      <div className="flex gap-1 mb-6 border-b border-slate-200">
        {TABS.map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === key ? 'border-current' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300',
            )}
            style={tab === key ? { color: 'var(--accent)', borderColor: 'var(--accent)' } : {}}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'enrollment' && <EnrollmentReport />}
      {tab === 'attendance' && <AttendanceReport />}
      {tab === 'academics'  && <AcademicsReport />}
      {tab === 'fees'       && <FeesReport />}
      {tab === 'transport'  && <TransportReport />}
      {tab === 'feeding'    && <FeedingReport />}
    </div>
  );
}
