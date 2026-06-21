'use client';

import { useState, useCallback } from 'react';
import { staffApi } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { downloadCsv } from '@/lib/csv';
import { presetRange, type Preset } from '@/lib/date-range';
import { PeriodBar, type PeriodYear, type ReportPeriod } from '@/components/reports/period-bar';
import { cn } from '@/lib/cn';

// ── Types (mirror apps/api/src/reports/reports.service.ts) ──────────────────────

type Tab = 'enrollment' | 'attendance' | 'academics' | 'fees' | 'transport' | 'feeding';

type StudentRef = { id: string; studentId: string; firstName: string; lastName: string };
type ClassRef = { id: string; name: string };

type EnrollmentData = {
  academicYearId: string;
  totalStudents: number;
  newStudents: number;
  byTerm: { term: { id: string; name: string }; newStudents: number | null }[];
  byGradeLevel: {
    gradeLevel: { id: string; name: string; sequence: number };
    classes: { id: string; name: string; studentCount: number }[];
    total: number;
  }[];
};

type AttendanceData = {
  schoolAvgRate: number;
  studentCount: number;
  rows: { student: StudentRef; present: number; absent: number; late: number; total: number; rate: number }[];
};
type AttendanceDailyData = {
  days: { date: string; present: number; absent: number; late: number; excused: number; total: number; rate: number }[];
};
type CoverageData = {
  schoolDayCount: number;
  rows: { class: ClassRef; classTeachers: string[]; markedCount: number; missingCount: number; missingDates: string[] }[];
};

type AcademicsData = {
  studentCount: number;
  avgPercentage: number | null;
  byClass: { class: ClassRef; studentCount: number; avgPercentage: number | null }[];
  distribution: { grade: string; count: number }[];
  bySubject: { subject: { id: string; name: string }; scored: number; avgPercentage: number | null }[];
  rows: {
    student: StudentRef;
    class: { id: string; name: string; gradeLevel: { id: string; name: string } };
    assessmentCount: number; totalRaw: number; totalPossible: number;
    percentage: number | null; gradeLabel: string | null;
  }[];
};

type FeesData = {
  summary: {
    totalStudents: number; fullyPaid: number; withBalance: number;
    totalBilled: number; totalCollected: number; totalOutstanding: number; collectionRate: number;
  };
  byClass: { class: ClassRef; billed: number; collected: number; outstanding: number; students: number }[];
  rows: {
    student: StudentRef;
    class: { id: string; name: string } | null;
    amount: number; amountPaid: number; balance: number; isPaid: boolean;
  }[];
};

type TransportData = {
  totalRoutes: number; totalStudentsAssigned: number;
  routes: {
    id: string; name: string; dailyRate: number;
    vehicle: { plateNumber: string; model: string; capacity: number } | null;
    driver: { name: string; phone: string } | null;
    studentCount: number; capacity: number | null; occupancyRate: number | null;
  }[];
};
type TransportDailyData = {
  days: { date: string; paid: number; preCovered: number; unpaid: number; absent: number; collected: number; riders: number }[];
};

type FeedingData = {
  totalCollected: number; paymentCount: number; dailyPaidCount: number; unpaidCount: number;
  payments: { id: string; amountPaid: number | string; paymentDate: string; student: StudentRef; recordedByUser: { firstName: string; lastName: string } | null }[];
};

// ── Shared bits ─────────────────────────────────────────────────────────────────

function ghs(n: number) { return `GHS ${n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function fullName(s: { firstName: string; lastName: string }) { return `${s.firstName} ${s.lastName}`; }
function fmtDay(d: string) { return new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }); }

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-5 py-4">
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color ?? 'text-slate-800'}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3 mt-1">
      <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">{title}</h3>
      {action}
    </div>
  );
}

function ExportButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition disabled:opacity-40 disabled:cursor-not-allowed">
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3" />
      </svg>
      Export CSV
    </button>
  );
}

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: color }} />
    </div>
  );
}

function Skeleton() { return <div className="h-40 bg-slate-100 rounded-2xl animate-pulse" />; }
function Empty({ children }: { children: React.ReactNode }) { return <p className="text-sm text-slate-400 text-center py-12">{children}</p>; }

const thBase = 'px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide';
const card = 'bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden';
const selectInput = 'px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none';

function rateColor(r: number) { return r >= 90 ? 'text-emerald-600' : r >= 75 ? 'text-amber-600' : 'text-red-500'; }
function scoreColor(s: number) { return s >= 70 ? 'text-emerald-600' : s >= 50 ? 'text-amber-600' : 'text-red-500'; }
function rateBarColor(r: number) { return r >= 90 ? '#10b981' : r >= 75 ? '#f59e0b' : '#ef4444'; }

// ── Enrollment ──────────────────────────────────────────────────────────────────

function EnrollmentReport({ yearId }: { yearId: string }) {
  const fetchReport = useCallback(
    () => yearId ? staffApi.get<EnrollmentData>(`/school/reports/enrollment?academicYearId=${yearId}`).catch(() => null) : Promise.resolve(null),
    [yearId],
  );
  const { data, loading } = useApi(fetchReport, yearId);

  function exportCsv() {
    if (!data) return;
    downloadCsv('enrollment', ['Grade level', 'Class', 'Students'],
      data.byGradeLevel.flatMap(g => g.classes.map(c => [g.gradeLevel.name, c.name, c.studentCount])));
  }

  if (loading) return <Skeleton />;
  if (!data) return <Empty>Select an academic year to view enrollment data.</Empty>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatCard label="Total students" value={data.totalStudents} />
        <StatCard label="New this year" value={data.newStudents} color="text-emerald-600" />
        <StatCard label="Grade levels" value={data.byGradeLevel.length} />
      </div>

      <div>
        <SectionHeader title="New students by term" />
        <div className={card}>
          <table className="w-full">
            <thead><tr className="border-b border-slate-100 bg-slate-50">
              <th className={`${thBase} text-left`}>Term</th>
              <th className={`${thBase} text-right`}>New students</th>
            </tr></thead>
            <tbody>
              {data.byTerm.map(t => (
                <tr key={t.term.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-2.5 text-sm text-slate-700">{t.term.name}</td>
                  <td className="px-4 py-2.5 text-sm font-medium text-right">
                    {t.newStudents === null ? <span className="text-slate-300" title="Set this term's dates to count">— set dates</span>
                      : <span className="text-slate-800">{t.newStudents}</span>}
                  </td>
                </tr>
              ))}
              {data.byTerm.length === 0 && <tr><td colSpan={2} className="px-4 py-8 text-center text-sm text-slate-400">No terms in this year.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <SectionHeader title="By class" action={<ExportButton onClick={exportCsv} disabled={data.totalStudents === 0} />} />
        <div className={card}>
          <table className="w-full">
            <thead><tr className="border-b border-slate-100 bg-slate-50">
              <th className={`${thBase} text-left`}>Grade level</th>
              <th className={`${thBase} text-left`}>Class</th>
              <th className={`${thBase} text-right`}>Students</th>
            </tr></thead>
            <tbody>
              {data.byGradeLevel.map(g => (
                g.classes.length === 0 ? (
                  <tr key={g.gradeLevel.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-2.5 text-sm font-medium text-slate-700">{g.gradeLevel.name}</td>
                    <td className="px-4 py-2.5 text-sm text-slate-400 italic" colSpan={2}>No classes</td>
                  </tr>
                ) : g.classes.map((c, i) => (
                  <tr key={c.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/40 transition">
                    <td className="px-4 py-2.5 text-sm font-medium text-slate-700">{i === 0 ? g.gradeLevel.name : ''}</td>
                    <td className="px-4 py-2.5 text-sm text-slate-600">{c.name}</td>
                    <td className="px-4 py-2.5 text-sm font-medium text-slate-800 text-right">{c.studentCount}</td>
                  </tr>
                ))
              ))}
              {data.byGradeLevel.length === 0 && <tr><td colSpan={3} className="px-4 py-12 text-center text-sm text-slate-400">No grade levels configured.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Attendance ──────────────────────────────────────────────────────────────────

function AttendanceReport({ range }: { range: { start: string; end: string } }) {
  const [classId, setClassId] = useState('');
  const { data: classes } = useApi(useCallback(() => staffApi.get<ClassRef[]>('/school/grade-structure/classes').catch(() => []), []));

  const key = `${range.start}|${range.end}|${classId}`;
  const { data: summary, loading: l1 } = useApi(useCallback(() => {
    const p = new URLSearchParams({ startDate: range.start, endDate: range.end });
    if (classId) p.set('classId', classId);
    return staffApi.get<AttendanceData>(`/school/reports/attendance?${p}`).catch(() => null);
  }, [range.start, range.end, classId]), key);
  const { data: daily, loading: l2 } = useApi(useCallback(() => {
    const p = new URLSearchParams({ startDate: range.start, endDate: range.end });
    if (classId) p.set('classId', classId);
    return staffApi.get<AttendanceDailyData>(`/school/reports/attendance/daily?${p}`).catch(() => null);
  }, [range.start, range.end, classId]), key);
  const { data: coverage, loading: l3 } = useApi(useCallback(
    () => staffApi.get<CoverageData>(`/school/reports/attendance/coverage?startDate=${range.start}&endDate=${range.end}`).catch(() => null),
    [range.start, range.end]), `${range.start}|${range.end}`);

  const chronic = (summary?.rows ?? []).filter(r => r.total >= 3 && r.rate < 75);

  function exportStudents() {
    if (!summary) return;
    downloadCsv('attendance-by-student', ['Student ID', 'Name', 'Present', 'Absent', 'Late', 'Days', 'Rate'],
      summary.rows.map(r => [r.student.studentId, fullName(r.student), r.present, r.absent, r.late, r.total, `${r.rate}%`]));
  }
  function exportDaily() {
    if (!daily) return;
    downloadCsv('attendance-daily', ['Date', 'Present', 'Absent', 'Late', 'Excused', 'Total', 'Rate'],
      daily.days.map(d => [d.date, d.present, d.absent, d.late, d.excused, d.total, `${d.rate}%`]));
  }
  function exportCoverage() {
    if (!coverage) return;
    downloadCsv('attendance-coverage', ['Class', 'Class teacher(s)', 'Marked', 'Missing', 'Missing dates'],
      coverage.rows.map(r => [r.class.name, r.classTeachers.join('; '), r.markedCount, r.missingCount, r.missingDates.join(' ')]));
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-3 items-center">
        <select value={classId} onChange={e => setClassId(e.target.value)} className={selectInput}>
          <option value="">All classes</option>
          {classes?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <p className="text-xs text-slate-400">Filters apply to the daily trend & by-student views. Coverage always spans all classes.</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatCard label="School average" value={summary ? `${summary.schoolAvgRate}%` : '—'} color={summary ? rateColor(summary.schoolAvgRate) : undefined} />
        <StatCard label="Students tracked" value={summary?.studentCount ?? 0} />
        <StatCard label="Chronic absentees" value={chronic.length} color={chronic.length ? 'text-red-500' : undefined} sub="< 75% over ≥3 days" />
      </div>

      {/* Daily trend */}
      <div>
        <SectionHeader title="Daily attendance" action={<ExportButton onClick={exportDaily} disabled={!daily?.days.length} />} />
        {l2 ? <Skeleton /> : (
          <div className={cn(card, 'overflow-x-auto')}>
            <table className="w-full min-w-[640px]">
              <thead><tr className="border-b border-slate-100 bg-slate-50">
                <th className={`${thBase} text-left`}>Date</th>
                <th className={`${thBase} text-center`}>In school</th>
                <th className={`${thBase} text-center`}>Absent</th>
                <th className={`${thBase} text-center`}>Late</th>
                <th className={`${thBase} text-left w-1/3`}>Rate</th>
              </tr></thead>
              <tbody>
                {daily?.days.map(d => (
                  <tr key={d.date} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/40 transition">
                    <td className="px-4 py-2.5 text-sm text-slate-700">{fmtDay(d.date)}</td>
                    <td className="px-4 py-2.5 text-center text-sm text-emerald-600 font-medium">{d.present + d.late}</td>
                    <td className="px-4 py-2.5 text-center text-sm text-red-400">{d.absent}</td>
                    <td className="px-4 py-2.5 text-center text-sm text-amber-500">{d.late}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1"><Bar pct={d.rate} color={rateBarColor(d.rate)} /></div>
                        <span className={`text-xs font-semibold w-10 text-right ${rateColor(d.rate)}`}>{d.rate}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
                {!daily?.days.length && <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-slate-400">No attendance recorded in this period.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Coverage */}
      <div>
        <SectionHeader title={`Coverage — who hasn't marked (${coverage?.schoolDayCount ?? 0} school days)`} action={<ExportButton onClick={exportCoverage} disabled={!coverage?.rows.length} />} />
        {l3 ? <Skeleton /> : (
          <div className={cn(card, 'overflow-x-auto')}>
            <table className="w-full min-w-[680px]">
              <thead><tr className="border-b border-slate-100 bg-slate-50">
                <th className={`${thBase} text-left`}>Class</th>
                <th className={`${thBase} text-left`}>Class teacher(s)</th>
                <th className={`${thBase} text-center`}>Marked</th>
                <th className={`${thBase} text-center`}>Missing</th>
                <th className={`${thBase} text-left`}>Missing dates</th>
              </tr></thead>
              <tbody>
                {coverage?.rows.map(r => (
                  <tr key={r.class.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/40 transition">
                    <td className="px-4 py-3 text-sm font-medium text-slate-800">{r.class.name}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{r.classTeachers.length ? r.classTeachers.join(', ') : <span className="text-slate-300 italic">No class teacher</span>}</td>
                    <td className="px-4 py-3 text-center text-sm text-emerald-600">{r.markedCount}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn('text-sm font-semibold', r.missingCount ? 'text-red-500' : 'text-slate-300')}>{r.missingCount}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1 max-w-md">
                        {r.missingDates.slice(0, 8).map(d => (
                          <span key={d} className="text-[11px] px-1.5 py-0.5 rounded bg-red-50 text-red-500">{new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                        ))}
                        {r.missingDates.length > 8 && <span className="text-[11px] text-slate-400">+{r.missingDates.length - 8} more</span>}
                        {r.missingCount === 0 && <span className="text-xs text-emerald-500">All marked ✓</span>}
                      </div>
                    </td>
                  </tr>
                ))}
                {!coverage?.rows.length && <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-slate-400">No school days in this period.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* By student + chronic */}
      <div>
        <SectionHeader title="By student (lowest first)" action={<ExportButton onClick={exportStudents} disabled={!summary?.rows.length} />} />
        {l1 ? <Skeleton /> : (
          <div className={cn(card, 'overflow-x-auto')}>
            <table className="w-full min-w-[640px]">
              <thead><tr className="border-b border-slate-100 bg-slate-50">
                <th className={`${thBase} text-left`}>Student</th>
                <th className={`${thBase} text-center`}>Present</th>
                <th className={`${thBase} text-center`}>Absent</th>
                <th className={`${thBase} text-center`}>Late</th>
                <th className={`${thBase} text-center`}>Days</th>
                <th className={`${thBase} text-right`}>Rate</th>
              </tr></thead>
              <tbody>
                {summary?.rows.map(r => {
                  const isChronic = r.total >= 3 && r.rate < 75;
                  return (
                    <tr key={r.student.id} className={cn('border-b border-slate-50 last:border-0 transition', isChronic ? 'bg-red-50/40 hover:bg-red-50/60' : 'hover:bg-slate-50/40')}>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-slate-800">{fullName(r.student)}{isChronic && <span className="ml-2 text-[10px] uppercase font-bold text-red-500">chronic</span>}</p>
                        <p className="text-xs text-slate-400 font-mono">{r.student.studentId}</p>
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-emerald-600">{r.present}</td>
                      <td className="px-4 py-3 text-center text-sm text-red-400">{r.absent}</td>
                      <td className="px-4 py-3 text-center text-sm text-amber-500">{r.late}</td>
                      <td className="px-4 py-3 text-center text-sm text-slate-500">{r.total}</td>
                      <td className="px-4 py-3 text-right"><span className={`text-sm font-bold ${rateColor(r.rate)}`}>{r.rate}%</span></td>
                    </tr>
                  );
                })}
                {!summary?.rows.length && <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-400">No attendance records for this period.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Academics ───────────────────────────────────────────────────────────────────

function AcademicsReport({ termId }: { termId: string }) {
  const [classId, setClassId] = useState('');
  const { data: classes } = useApi(useCallback(() => staffApi.get<ClassRef[]>('/school/grade-structure/classes').catch(() => []), []));

  const fetchReport = useCallback(() => {
    if (!termId) return Promise.resolve(null);
    const p = new URLSearchParams({ termId });
    if (classId) p.set('classId', classId);
    return staffApi.get<AcademicsData>(`/school/reports/academics?${p}`).catch(() => null);
  }, [termId, classId]);
  const { data, loading } = useApi(fetchReport, `${termId}|${classId}`);

  const top = (data?.rows ?? []).filter(r => r.percentage !== null).slice(0, 5);
  const bottom = (data?.rows ?? []).filter(r => r.percentage !== null).slice(-5).reverse();
  const maxDist = Math.max(1, ...(data?.distribution ?? []).map(d => d.count));

  function exportRanking() {
    if (!data) return;
    downloadCsv('academics-ranking', ['Rank', 'Student ID', 'Name', 'Class', 'Assessments', 'Raw', 'Possible', 'Percentage', 'Grade'],
      data.rows.map((r, i) => [i + 1, r.student.studentId, fullName(r.student), r.class.name, r.assessmentCount, r.totalRaw, r.totalPossible, r.percentage === null ? '' : `${r.percentage}%`, r.gradeLabel ?? '']));
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-3 items-center">
        <select value={classId} onChange={e => setClassId(e.target.value)} className={selectInput}>
          <option value="">All classes</option>
          {classes?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {loading && <Skeleton />}
      {!loading && !termId && <Empty>Select a term to view the academic report.</Empty>}
      {!loading && termId && data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <StatCard label="Class average" value={data.avgPercentage === null ? '—' : `${data.avgPercentage}%`} color={data.avgPercentage === null ? undefined : scoreColor(data.avgPercentage)} />
            <StatCard label="Students" value={data.studentCount} />
            <StatCard label="Subjects assessed" value={data.bySubject.length} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Class performance */}
            <div>
              <SectionHeader title="Class performance" />
              <div className={card}>
                <table className="w-full">
                  <thead><tr className="border-b border-slate-100 bg-slate-50">
                    <th className={`${thBase} text-left`}>Class</th>
                    <th className={`${thBase} text-center`}>Students</th>
                    <th className={`${thBase} text-left w-2/5`}>Average</th>
                  </tr></thead>
                  <tbody>
                    {data.byClass.map(c => (
                      <tr key={c.class.id} className="border-b border-slate-50 last:border-0">
                        <td className="px-4 py-2.5 text-sm font-medium text-slate-700">{c.class.name}</td>
                        <td className="px-4 py-2.5 text-center text-sm text-slate-500">{c.studentCount}</td>
                        <td className="px-4 py-2.5">
                          {c.avgPercentage === null ? <span className="text-sm text-slate-300">—</span> : (
                            <div className="flex items-center gap-2">
                              <div className="flex-1"><Bar pct={c.avgPercentage} color={rateBarColor(c.avgPercentage >= 70 ? 95 : c.avgPercentage >= 50 ? 80 : 50)} /></div>
                              <span className={`text-xs font-semibold w-9 text-right ${scoreColor(c.avgPercentage)}`}>{c.avgPercentage}%</span>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {data.byClass.length === 0 && <tr><td colSpan={3} className="px-4 py-8 text-center text-sm text-slate-400">No data.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Grade distribution */}
            <div>
              <SectionHeader title="Grade distribution" />
              <div className={cn(card, 'p-4')}>
                {data.distribution.length === 0 ? <p className="text-sm text-slate-400 text-center py-8">No grades yet.</p> : (
                  <div className="space-y-2.5">
                    {data.distribution.map(d => (
                      <div key={d.grade} className="flex items-center gap-3">
                        <span className="text-xs font-semibold text-slate-600 w-12 shrink-0">{d.grade}</span>
                        <div className="flex-1"><Bar pct={(d.count / maxDist) * 100} color="var(--accent)" /></div>
                        <span className="text-xs text-slate-500 w-8 text-right">{d.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Subject performance */}
          <div>
            <SectionHeader title="Subject performance" />
            <div className={cn(card, 'overflow-x-auto')}>
              <table className="w-full min-w-[480px]">
                <thead><tr className="border-b border-slate-100 bg-slate-50">
                  <th className={`${thBase} text-left`}>Subject</th>
                  <th className={`${thBase} text-center`}>Scores</th>
                  <th className={`${thBase} text-left w-2/5`}>Average</th>
                </tr></thead>
                <tbody>
                  {data.bySubject.map(s => (
                    <tr key={s.subject.id} className="border-b border-slate-50 last:border-0">
                      <td className="px-4 py-2.5 text-sm font-medium text-slate-700">{s.subject.name}</td>
                      <td className="px-4 py-2.5 text-center text-sm text-slate-500">{s.scored}</td>
                      <td className="px-4 py-2.5">
                        {s.avgPercentage === null ? <span className="text-sm text-slate-300">—</span> : (
                          <div className="flex items-center gap-2">
                            <div className="flex-1"><Bar pct={s.avgPercentage} color={rateBarColor(s.avgPercentage >= 70 ? 95 : s.avgPercentage >= 50 ? 80 : 50)} /></div>
                            <span className={`text-xs font-semibold w-9 text-right ${scoreColor(s.avgPercentage)}`}>{s.avgPercentage}%</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {data.bySubject.length === 0 && <tr><td colSpan={3} className="px-4 py-8 text-center text-sm text-slate-400">No subject scores for this term.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top / bottom */}
          {(top.length > 0 || bottom.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <TopList title="Top performers" rows={top} color="text-emerald-600" />
              <TopList title="Needs support" rows={bottom} color="text-red-500" />
            </div>
          )}

          {/* Full ranking */}
          <div>
            <SectionHeader title="Full ranking" action={<ExportButton onClick={exportRanking} disabled={!data.rows.length} />} />
            <div className={cn(card, 'overflow-x-auto')}>
              <table className="w-full min-w-[680px]">
                <thead><tr className="border-b border-slate-100 bg-slate-50">
                  <th className={`${thBase} text-center w-12`}>#</th>
                  <th className={`${thBase} text-left`}>Student</th>
                  <th className={`${thBase} text-left`}>Class</th>
                  <th className={`${thBase} text-center`}>Assessments</th>
                  <th className={`${thBase} text-center`}>Total</th>
                  <th className={`${thBase} text-center`}>%</th>
                  <th className={`${thBase} text-center`}>Grade</th>
                </tr></thead>
                <tbody>
                  {data.rows.map((r, i) => (
                    <tr key={r.student.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/40 transition">
                      <td className="px-4 py-3 text-center text-sm text-slate-400">{i + 1}</td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-slate-800">{fullName(r.student)}</p>
                        <p className="text-xs text-slate-400 font-mono">{r.student.studentId}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{r.class.name}</td>
                      <td className="px-4 py-3 text-center text-sm text-slate-500">{r.assessmentCount}</td>
                      <td className="px-4 py-3 text-center text-sm text-slate-500">{r.totalRaw}/{r.totalPossible}</td>
                      <td className="px-4 py-3 text-center">{r.percentage === null ? <span className="text-sm text-slate-300">—</span> : <span className={`text-sm font-bold ${scoreColor(r.percentage)}`}>{r.percentage}%</span>}</td>
                      <td className="px-4 py-3 text-center text-sm font-medium text-slate-700">{r.gradeLabel ?? '—'}</td>
                    </tr>
                  ))}
                  {data.rows.length === 0 && <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-400">No academic data for this term.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function TopList({ title, rows, color }: { title: string; rows: AcademicsData['rows']; color: string }) {
  return (
    <div>
      <SectionHeader title={title} />
      <div className={cn(card, 'divide-y divide-slate-50')}>
        {rows.length === 0 && <p className="text-sm text-slate-400 text-center py-6">No data.</p>}
        {rows.map(r => (
          <div key={r.student.id} className="flex items-center justify-between px-4 py-2.5">
            <div>
              <p className="text-sm font-medium text-slate-700">{fullName(r.student)}</p>
              <p className="text-xs text-slate-400">{r.class.name}</p>
            </div>
            <span className={`text-sm font-bold ${color}`}>{r.percentage}%{r.gradeLabel ? <span className="text-slate-400 font-normal text-xs ml-1">({r.gradeLabel})</span> : null}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Fees ────────────────────────────────────────────────────────────────────────

function FeesReport({ termId }: { termId: string }) {
  const fetchReport = useCallback(
    () => termId ? staffApi.get<FeesData>(`/school/reports/fee-balances?termId=${termId}`).catch(() => null) : Promise.resolve(null),
    [termId],
  );
  const { data, loading } = useApi(fetchReport, termId);

  function exportCsv() {
    if (!data) return;
    downloadCsv('fee-balances', ['Student ID', 'Name', 'Class', 'Billed', 'Paid', 'Balance', 'Status'],
      data.rows.map(r => [r.student.studentId, fullName(r.student), r.class?.name ?? '', r.amount.toFixed(2), r.amountPaid.toFixed(2), r.balance.toFixed(2), r.isPaid ? 'Paid' : 'Outstanding']));
  }

  if (loading) return <Skeleton />;
  if (!termId) return <Empty>Select a term to view the fee report.</Empty>;
  if (!data) return <Empty>Couldn’t load the fee report for this term.</Empty>;
  if (data.summary.totalStudents === 0) return <Empty>No invoices have been generated for this term yet. Generate term invoices under Fees → Invoices first.</Empty>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Billed" value={ghs(data.summary.totalBilled)} />
        <StatCard label="Collected" value={ghs(data.summary.totalCollected)} color="text-emerald-600" sub={`${data.summary.collectionRate}% collection rate`} />
        <StatCard label="Outstanding" value={ghs(data.summary.totalOutstanding)} color="text-red-500" sub={`${data.summary.withBalance} with balance`} />
        <StatCard label="Fully paid" value={`${data.summary.fullyPaid} / ${data.summary.totalStudents}`} />
      </div>

      <div>
        <SectionHeader title="By class" />
        <div className={cn(card, 'overflow-x-auto')}>
          <table className="w-full min-w-[560px]">
            <thead><tr className="border-b border-slate-100 bg-slate-50">
              <th className={`${thBase} text-left`}>Class</th>
              <th className={`${thBase} text-center`}>Students</th>
              <th className={`${thBase} text-right`}>Billed</th>
              <th className={`${thBase} text-right`}>Collected</th>
              <th className={`${thBase} text-right`}>Outstanding</th>
            </tr></thead>
            <tbody>
              {data.byClass.map(c => (
                <tr key={c.class.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/40 transition">
                  <td className="px-4 py-2.5 text-sm font-medium text-slate-700">{c.class.name}</td>
                  <td className="px-4 py-2.5 text-center text-sm text-slate-500">{c.students}</td>
                  <td className="px-4 py-2.5 text-right text-sm text-slate-600">{c.billed.toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-right text-sm text-emerald-600">{c.collected.toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-right text-sm font-medium" style={{ color: c.outstanding > 0 ? '#ef4444' : '#94a3b8' }}>{c.outstanding.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <SectionHeader title="By student (largest balance first)" action={<ExportButton onClick={exportCsv} disabled={!data.rows.length} />} />
        <div className={cn(card, 'overflow-x-auto')}>
          <table className="w-full min-w-[640px]">
            <thead><tr className="border-b border-slate-100 bg-slate-50">
              <th className={`${thBase} text-left`}>Student</th>
              <th className={`${thBase} text-left`}>Class</th>
              <th className={`${thBase} text-right`}>Billed</th>
              <th className={`${thBase} text-right`}>Paid</th>
              <th className={`${thBase} text-right`}>Balance</th>
            </tr></thead>
            <tbody>
              {data.rows.map(r => (
                <tr key={r.student.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/40 transition">
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-slate-800">{fullName(r.student)}</p>
                    <p className="text-xs text-slate-400 font-mono">{r.student.studentId}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{r.class?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-right text-sm text-slate-600">{r.amount.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right text-sm text-emerald-600">{r.amountPaid.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right text-sm font-medium" style={{ color: r.balance > 0 ? '#ef4444' : '#94a3b8' }}>{r.balance.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Transport ───────────────────────────────────────────────────────────────────

function TransportReport({ range }: { range: { start: string; end: string } }) {
  const [routeId, setRouteId] = useState('');
  const { data, loading } = useApi(useCallback(() => staffApi.get<TransportData>('/school/reports/transport').catch(() => null), []));
  const { data: daily, loading: l2 } = useApi(useCallback(() => {
    const p = new URLSearchParams({ startDate: range.start, endDate: range.end });
    if (routeId) p.set('routeId', routeId);
    return staffApi.get<TransportDailyData>(`/school/reports/transport/daily?${p}`).catch(() => null);
  }, [range.start, range.end, routeId]), `${range.start}|${range.end}|${routeId}`);

  function exportRoutes() {
    if (!data) return;
    downloadCsv('transport-routes', ['Route', 'Vehicle', 'Driver', 'Students', 'Capacity', 'Occupancy', 'Daily rate'],
      data.routes.map(r => [r.name, r.vehicle?.plateNumber ?? '', r.driver?.name ?? '', r.studentCount, r.capacity ?? '', r.occupancyRate === null ? '' : `${r.occupancyRate}%`, r.dailyRate]));
  }
  function exportDaily() {
    if (!daily) return;
    downloadCsv('transport-daily', ['Date', 'Riders', 'Paid', 'Pre-covered', 'Unpaid', 'Did not ride', 'Collected'],
      daily.days.map(d => [d.date, d.riders, d.paid, d.preCovered, d.unpaid, d.absent, d.collected.toFixed(2)]));
  }

  return (
    <div className="space-y-6">
      {loading ? <Skeleton /> : data && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <StatCard label="Routes" value={data.totalRoutes} />
            <StatCard label="Students assigned" value={data.totalStudentsAssigned} color="text-emerald-600" />
          </div>
          <div>
            <SectionHeader title="Routes" action={<ExportButton onClick={exportRoutes} disabled={!data.routes.length} />} />
            <div className={cn(card, 'overflow-x-auto')}>
              <table className="w-full min-w-[680px]">
                <thead><tr className="border-b border-slate-100 bg-slate-50">
                  <th className={`${thBase} text-left`}>Route</th>
                  <th className={`${thBase} text-left`}>Vehicle</th>
                  <th className={`${thBase} text-left`}>Driver</th>
                  <th className={`${thBase} text-center`}>Students</th>
                  <th className={`${thBase} text-center`}>Occupancy</th>
                  <th className={`${thBase} text-right`}>Daily rate</th>
                </tr></thead>
                <tbody>
                  {data.routes.map(r => (
                    <tr key={r.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/40 transition">
                      <td className="px-4 py-3 text-sm font-medium text-slate-800">{r.name}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{r.vehicle?.plateNumber ?? '—'}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{r.driver?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-center text-sm text-slate-600">{r.studentCount}{r.capacity ? <span className="text-slate-400"> / {r.capacity}</span> : null}</td>
                      <td className="px-4 py-3 text-center text-sm">{r.occupancyRate === null ? <span className="text-slate-300">—</span> : <span className={r.occupancyRate >= 100 ? 'text-red-500 font-medium' : 'text-slate-600'}>{r.occupancyRate}%</span>}</td>
                      <td className="px-4 py-3 text-right text-sm text-slate-700">{ghs(Number(r.dailyRate))}</td>
                    </tr>
                  ))}
                  {data.routes.length === 0 && <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-400">No transport routes configured.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Daily history */}
      <div>
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Daily history</h3>
          <div className="flex items-center gap-2">
            <select value={routeId} onChange={e => setRouteId(e.target.value)} className={selectInput}>
              <option value="">All routes</option>
              {data?.routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <ExportButton onClick={exportDaily} disabled={!daily?.days.length} />
          </div>
        </div>
        {l2 ? <Skeleton /> : (
          <div className={cn(card, 'overflow-x-auto')}>
            <table className="w-full min-w-[680px]">
              <thead><tr className="border-b border-slate-100 bg-slate-50">
                <th className={`${thBase} text-left`}>Date</th>
                <th className={`${thBase} text-center`}>Riders</th>
                <th className={`${thBase} text-center`}>Paid</th>
                <th className={`${thBase} text-center`}>Pre-covered</th>
                <th className={`${thBase} text-center`}>Unpaid</th>
                <th className={`${thBase} text-center`}>Didn’t ride</th>
                <th className={`${thBase} text-right`}>Collected</th>
              </tr></thead>
              <tbody>
                {daily?.days.map(d => (
                  <tr key={d.date} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/40 transition">
                    <td className="px-4 py-2.5 text-sm text-slate-700">{fmtDay(d.date)}</td>
                    <td className="px-4 py-2.5 text-center text-sm font-medium text-slate-700">{d.riders}</td>
                    <td className="px-4 py-2.5 text-center text-sm text-emerald-600">{d.paid}</td>
                    <td className="px-4 py-2.5 text-center text-sm text-blue-500">{d.preCovered}</td>
                    <td className="px-4 py-2.5 text-center text-sm text-red-400">{d.unpaid}</td>
                    <td className="px-4 py-2.5 text-center text-sm text-slate-400">{d.absent}</td>
                    <td className="px-4 py-2.5 text-right text-sm font-semibold text-slate-800">{ghs(d.collected)}</td>
                  </tr>
                ))}
                {!daily?.days.length && <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-400">No transport activity in this period.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Feeding (unchanged) ──────────────────────────────────────────────────────────

function FeedingReport({ range }: { range: { start: string; end: string } }) {
  const fetchReport = useCallback(
    () => staffApi.get<FeedingData>(`/school/reports/feeding?startDate=${range.start}&endDate=${range.end}`).catch(() => null),
    [range.start, range.end],
  );
  const { data, loading } = useApi(fetchReport, `${range.start}|${range.end}`);

  function exportCsv() {
    if (!data) return;
    downloadCsv('feeding', ['Date', 'Student ID', 'Name', 'Amount', 'Recorded by'],
      data.payments.map(p => [new Date(p.paymentDate).toLocaleDateString('en-GB'), p.student.studentId, fullName(p.student), Number(p.amountPaid).toFixed(2), p.recordedByUser ? fullName(p.recordedByUser) : '']));
  }

  if (loading) return <Skeleton />;
  if (!data) return <Empty>Couldn’t load feeding data for this period.</Empty>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Cash collected" value={ghs(data.totalCollected)} color="text-emerald-600" sub={`${data.paymentCount} payment${data.paymentCount !== 1 ? 's' : ''}`} />
        <StatCard label="Days paid" value={data.dailyPaidCount} />
        <StatCard label="Days unpaid" value={data.unpaidCount} color="text-red-500" />
        <StatCard label="Payments" value={data.paymentCount} />
      </div>
      <div>
        <SectionHeader title="Payments" action={<ExportButton onClick={exportCsv} disabled={!data.payments.length} />} />
        <div className={cn(card, 'overflow-x-auto')}>
          <table className="w-full min-w-[560px]">
            <thead><tr className="border-b border-slate-100 bg-slate-50">
              <th className={`${thBase} text-left`}>Date</th>
              <th className={`${thBase} text-left`}>Student</th>
              <th className={`${thBase} text-left`}>Recorded by</th>
              <th className={`${thBase} text-right`}>Amount</th>
            </tr></thead>
            <tbody>
              {data.payments.map(p => (
                <tr key={p.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/40 transition">
                  <td className="px-4 py-2.5 text-sm text-slate-600">{new Date(p.paymentDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                  <td className="px-4 py-2.5">
                    <p className="text-sm text-slate-700">{fullName(p.student)}</p>
                    <p className="text-xs text-slate-400 font-mono">{p.student.studentId}</p>
                  </td>
                  <td className="px-4 py-2.5 text-sm text-slate-500">{p.recordedByUser ? fullName(p.recordedByUser) : '—'}</td>
                  <td className="px-4 py-2.5 text-right text-sm font-semibold text-slate-800">{ghs(Number(p.amountPaid))}</td>
                </tr>
              ))}
              {data.payments.length === 0 && <tr><td colSpan={4} className="px-4 py-12 text-center text-sm text-slate-400">No feeding payments for this period.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────────

const TABS: [Tab, string][] = [
  ['enrollment', 'Enrollment'],
  ['attendance', 'Attendance'],
  ['academics', 'Academics'],
  ['fees', 'Fees'],
  ['transport', 'Transport'],
  ['feeding', 'Feeding'],
];

const todayStr = new Date().toISOString().split('T')[0];

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>('enrollment');

  // Global period state — drives every tab.
  const { data: years } = useApi(useCallback(() => staffApi.get<PeriodYear[]>('/school/academic-years').catch(() => []), []));
  const [yearSel, setYearSel] = useState('');
  const [termSel, setTermSel] = useState('');
  const [preset, setPreset] = useState<Preset>('this-month');
  const [custom, setCustom] = useState({ start: todayStr.slice(0, 8) + '01', end: todayStr });

  // Effective selections (derived, no effects).
  const activeYear = years?.find(y => y.isActive) ?? years?.[0];
  const yearId = (years?.some(y => y.id === yearSel) ? yearSel : '') || activeYear?.id || '';
  const terms = years?.find(y => y.id === yearId)?.terms ?? [];
  const fallbackTerm = terms.find(t => t.isActive) ?? [...terms].reverse().find(t => t.startDate && t.endDate) ?? terms[terms.length - 1];
  const termId = (terms.some(t => t.id === termSel) ? termSel : '') || fallbackTerm?.id || '';
  const selectedTerm = terms.find(t => t.id === termId);
  const termBounds = {
    start: selectedTerm?.startDate ? selectedTerm.startDate.slice(0, 10) : null,
    end: selectedTerm?.endDate ? selectedTerm.endDate.slice(0, 10) : null,
  };
  const range = presetRange(preset, custom, termBounds);

  const period: ReportPeriod = { academicYearId: yearId, termId, range };

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900">Reports</h1>
        <p className="text-sm text-slate-500 mt-0.5">School-wide analytics and summaries. The period filter applies across every tab.</p>
      </div>

      <PeriodBar
        years={years}
        yearId={yearId}
        termId={termId}
        preset={preset}
        custom={custom}
        termAvailable={!!(termBounds.start && termBounds.end)}
        onYear={v => { setYearSel(v); setTermSel(''); }}
        onTerm={setTermSel}
        onPreset={setPreset}
        onCustom={c => { setCustom(c); setPreset('custom'); }}
      />

      <div className="flex gap-1 mb-6 border-b border-slate-200 overflow-x-auto">
        {TABS.map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn('px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
              tab === key ? 'border-current' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300')}
            style={tab === key ? { color: 'var(--accent)', borderColor: 'var(--accent)' } : {}}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'enrollment' && <EnrollmentReport yearId={period.academicYearId} />}
      {tab === 'attendance' && <AttendanceReport range={period.range} />}
      {tab === 'academics' && <AcademicsReport termId={period.termId} />}
      {tab === 'fees' && <FeesReport termId={period.termId} />}
      {tab === 'transport' && <TransportReport range={period.range} />}
      {tab === 'feeding' && <FeedingReport range={period.range} />}
    </div>
  );
}
