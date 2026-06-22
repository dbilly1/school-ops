'use client';

import { useState, useCallback, useEffect } from 'react';
import { staffApi, type ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { useTeacherScope } from '@/hooks/use-teacher-scope';
import { SaveButton, Alert } from '@/components/ui/settings-card';
import { cn } from '@/lib/cn';

// ── Types ─────────────────────────────────────────────────────────────────────

type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';

type StudentRecord = {
  student: { id: string; studentId: string; firstName: string; lastName: string };
  status: AttendanceStatus | null;
  existingRecordId: string | null;
};

const STATUS_CONFIG: Record<AttendanceStatus, { label: string; color: string; bg: string }> = {
  PRESENT: { label: 'Present', color: '#22c55e', bg: '#f0fdf4' },
  LATE:    { label: 'Late',    color: '#f59e0b', bg: '#fffbeb' },
  ABSENT:  { label: 'Absent',  color: '#ef4444', bg: '#fef2f2' },
  EXCUSED: { label: 'Excused', color: '#64748b', bg: '#f8fafc' },
};

const STATUSES: AttendanceStatus[] = ['PRESENT', 'LATE', 'ABSENT', 'EXCUSED'];

type CoverageDay = { date: string; type: 'school' | 'weekend' | 'holiday' | 'off'; holidayName?: string };

type CoverageClass = {
  id: string; name: string;
  markedDates: string[]; missingDates: string[];
  markedCount: number; missingCount: number;
};

type CoverageResponse = {
  restricted: boolean;
  start: string; end: string;
  termStart: string | null; termEnd: string | null;
  schoolDayCount: number;
  days: CoverageDay[];
  classes: CoverageClass[];
};

// ── Range presets ─────────────────────────────────────────────────────────────

type Preset = 'this-week' | 'last-week' | 'this-month' | 'last-month' | 'term' | 'custom';

const PRESETS: { key: Preset; label: string }[] = [
  { key: 'this-week',  label: 'This week' },
  { key: 'last-week',  label: 'Last week' },
  { key: 'this-month', label: 'This month' },
  { key: 'last-month', label: 'Last month' },
  { key: 'term',       label: 'Entire term' },
  { key: 'custom',     label: 'Custom' },
];

function localKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function mondayOf(d: Date) {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // 0 = Monday
  return x;
}

// Resolve a preset to a concrete {start, end}. End is clamped to today — you can't
// mark the future. "Entire term" needs the term bounds carried back from coverage.
function presetRange(
  preset: Preset,
  custom: { start: string; end: string },
  term: { start: string | null; end: string | null },
): { start: string; end: string } {
  const now = new Date();
  const todayKey = localKey(now);
  switch (preset) {
    case 'this-week':
      return { start: localKey(mondayOf(now)), end: todayKey };
    case 'last-week': {
      const thisMon = mondayOf(now);
      const lastMon = new Date(thisMon); lastMon.setDate(lastMon.getDate() - 7);
      const lastSun = new Date(thisMon); lastSun.setDate(lastSun.getDate() - 1);
      return { start: localKey(lastMon), end: localKey(lastSun) };
    }
    case 'this-month':
      return { start: localKey(new Date(now.getFullYear(), now.getMonth(), 1)), end: todayKey };
    case 'last-month':
      return {
        start: localKey(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        end: localKey(new Date(now.getFullYear(), now.getMonth(), 0)),
      };
    case 'term':
      return { start: term.start ?? todayKey, end: term.end && term.end < todayKey ? term.end : todayKey };
    case 'custom':
      return { start: custom.start, end: custom.end };
  }
}

// Range control for the coverage card header: all presets shown as pill buttons
// on wider screens, collapsing to a dropdown below md. Date inputs reveal when
// "Custom" is selected.
function RangeControl({ preset, onPreset, custom, onCustom, termAvailable }: {
  preset: Preset;
  onPreset: (p: Preset) => void;
  custom: { start: string; end: string };
  onCustom: (c: { start: string; end: string }) => void;
  termAvailable: boolean;
}) {
  const today = new Date().toISOString().split('T')[0];
  const field = 'px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 outline-none';
  const presets = PRESETS.filter(p => p.key !== 'term' || termAvailable);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {preset === 'custom' && (
        <div className="flex items-center gap-1.5">
          <input type="date" value={custom.start} max={today}
            onChange={e => onCustom({ ...custom, start: e.target.value })} className={field} />
          <span className="text-xs text-slate-400">–</span>
          <input type="date" value={custom.end} max={today}
            onChange={e => onCustom({ ...custom, end: e.target.value })} className={field} />
        </div>
      )}

      {/* Pills — md and up, all visible */}
      <div className="hidden md:flex flex-wrap gap-1.5">
        {presets.map(p => {
          const active = preset === p.key;
          return (
            <button key={p.key} type="button" onClick={() => onPreset(p.key)}
              className={cn('px-3 py-1 rounded-full text-xs font-medium transition whitespace-nowrap',
                active ? 'text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}
              style={active ? { backgroundColor: 'var(--accent)' } : undefined}>
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Dropdown — below md */}
      <select value={preset} onChange={e => onPreset(e.target.value as Preset)}
        className={cn(field, 'md:hidden font-medium cursor-pointer pr-7')}>
        {presets.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
      </select>
    </div>
  );
}

// ── Coverage strip ────────────────────────────────────────────────────────────
// Adaptive: short ranges render a per-day grid (weekends/holidays struck through);
// longer ranges collapse to a per-class marked/missing summary. Cells & missing
// dates jump the marking view to that class + date.

const DAY_GRID_MAX = 16; // calendar days; beyond this the grid gets unwieldy

function CoverageStrip({ data, today, onJump, range }: {
  data: CoverageResponse | null;
  today: string;
  onJump: (classId: string, date: string) => void;
  range: React.ReactNode; // the RangeControl, rendered in the header
}) {
  const hasBody = !!data && data.schoolDayCount > 0 && data.classes.length > 0;
  const withGaps = hasBody ? data!.classes.filter(c => c.missingCount > 0).length : 0;

  return (
    <div className="mb-5 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Attendance coverage</h3>
          <p className="text-xs text-slate-400">
            {data && data.schoolDayCount > 0
              ? `${data.schoolDayCount} school ${data.schoolDayCount === 1 ? 'day' : 'days'} in range`
              : 'Which classes have marked attendance'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {hasBody && (
            <span className={cn('text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap',
              withGaps > 0 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700')}>
              {withGaps > 0
                ? `${withGaps} ${withGaps === 1 ? 'class has' : 'classes have'} gaps`
                : 'All classes fully marked'}
            </span>
          )}
          {range}
        </div>
      </div>
      {!data ? (
        <div className="px-4 py-8 text-center text-sm text-slate-400">Loading…</div>
      ) : data.schoolDayCount === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-slate-400">No school days in this range.</div>
      ) : data.classes.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-slate-400">No classes to show.</div>
      ) : data.days.length <= DAY_GRID_MAX ? (
        <CoverageGrid data={data} today={today} onJump={onJump} />
      ) : (
        <CoverageSummary data={data} onJump={onJump} />
      )}
    </div>
  );
}

function CoverageGrid({ data, today, onJump }: {
  data: CoverageResponse;
  today: string;
  onJump: (classId: string, date: string) => void;
}) {
  const dayLabel = (d: string) => {
    const dt = new Date(`${d}T00:00:00Z`);
    return { dow: dt.toLocaleDateString('en-GB', { weekday: 'narrow', timeZone: 'UTC' }), day: dt.getUTCDate() };
  };
  // Diagonal line for weekends, hatch for holidays — "not a school day".
  const weekendBg = 'linear-gradient(to top left, transparent calc(50% - 0.5px), #cbd5e1 calc(50% - 0.5px), #cbd5e1 calc(50% + 0.5px), transparent calc(50% + 0.5px))';
  const holidayBg = 'repeating-linear-gradient(45deg, #e2e8f0, #e2e8f0 2px, #f8fafc 2px, #f8fafc 4px)';

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <th className="px-4 py-2 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide sticky left-0 bg-white">Class</th>
            {data.days.map(d => {
              const { dow, day } = dayLabel(d.date);
              const isToday = d.date === today;
              return (
                <th key={d.date} className="px-1.5 py-2 text-center">
                  <span className={cn('text-[10px] font-semibold leading-tight block',
                    isToday ? 'text-slate-700' : d.type === 'school' ? 'text-slate-400' : 'text-slate-300')}>
                    {dow}<br />{day}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {data.classes.map(c => {
            const marked = new Set(c.markedDates);
            return (
              <tr key={c.id} className="border-t border-slate-50">
                <td className="px-4 py-2 text-sm font-medium text-slate-700 whitespace-nowrap sticky left-0 bg-white">{c.name}</td>
                {data.days.map(d => {
                  if (d.type !== 'school') {
                    const label = d.type === 'holiday' ? (d.holidayName ?? 'Holiday') : d.type === 'weekend' ? 'Weekend' : 'Not in term';
                    return (
                      <td key={d.date} className="px-1.5 py-2 text-center">
                        <span title={`${d.date} · ${label}`} className="inline-block h-6 w-6 rounded-md"
                          style={{ background: d.type === 'holiday' ? holidayBg : weekendBg }} />
                      </td>
                    );
                  }
                  const isMarked = marked.has(d.date);
                  return (
                    <td key={d.date} className="px-1.5 py-2 text-center">
                      <button type="button"
                        title={`${c.name} · ${d.date} · ${isMarked ? 'Marked' : 'Not marked'}`}
                        onClick={() => onJump(c.id, d.date)}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-md transition hover:ring-2 hover:ring-slate-200"
                        style={{ backgroundColor: isMarked ? '#f0fdf4' : '#fef2f2' }}>
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: isMarked ? '#22c55e' : '#ef4444' }} />
                      </button>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CoverageSummary({ data, onJump }: {
  data: CoverageResponse;
  onJump: (classId: string, date: string) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const total = data.schoolDayCount;
  return (
    <div className="divide-y divide-slate-50">
      {data.classes.map(c => {
        const pct = total > 0 ? Math.round((c.markedCount / total) * 100) : 0;
        const open = expanded === c.id;
        return (
          <div key={c.id} className="px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-slate-700 w-36 shrink-0 truncate">{c.name}</span>
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden min-w-[60px]">
                <div className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: c.missingCount === 0 ? '#22c55e' : 'var(--accent)' }} />
              </div>
              <span className="text-xs text-slate-500 w-24 text-right shrink-0">{c.markedCount} / {total}</span>
              {c.missingCount > 0 ? (
                <button type="button" onClick={() => setExpanded(open ? null : c.id)}
                  className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-600 shrink-0 w-24 text-center">
                  {c.missingCount} missing {open ? '▲' : '▼'}
                </button>
              ) : (
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 shrink-0 w-24 text-center">Complete</span>
              )}
            </div>
            {open && c.missingDates.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {c.missingDates.map(d => (
                  <button key={d} type="button" onClick={() => onJump(c.id, d)} title="Mark this day"
                    className="text-xs px-2 py-1 rounded-md bg-slate-50 text-slate-600 hover:bg-slate-100 transition">
                    {new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Status toggle ─────────────────────────────────────────────────────────────

function StatusToggle({ status, onChange }: {
  status: AttendanceStatus | null;
  onChange: (s: AttendanceStatus) => void;
}) {
  return (
    <div className="flex gap-1">
      {STATUSES.map(s => {
        const cfg    = STATUS_CONFIG[s];
        const active = status === s;
        return (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            className="px-2.5 py-1 rounded-lg text-xs font-medium transition"
            style={active
              ? { backgroundColor: cfg.color, color: '#fff' }
              : { backgroundColor: '#f1f5f9', color: '#64748b' }}
          >
            {cfg.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Student attendance tab ────────────────────────────────────────────────────

type AttendanceResponse = {
  date: string;
  classId: string;
  isSchoolDay: boolean;
  students: { student: StudentRecord['student']; record: { id: string; status: AttendanceStatus } | null }[];
};

function StudentAttendanceTab({ assignedClassIds, restricted }: {
  assignedClassIds: string[];
  restricted: boolean;
}) {
  const today = new Date().toISOString().split('T')[0];
  const [date, setDate]       = useState(today);
  const [classId, setClassId] = useState('');
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>({});
  const [saving, setSaving]   = useState(false);
  const [alert, setAlert]     = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  const fetchClasses  = useCallback(() => staffApi.get<{ id: string; name: string }[]>('/school/grade-structure/classes'), []);
  const fetchAttendance = useCallback(
    () => classId
      ? staffApi.get<AttendanceResponse>(`/school/attendance/class/${classId}?date=${date}`).catch(() => null)
      : Promise.resolve(null),
    [classId, date],
  );

  // Coverage range — preset-driven, with a custom range and term bounds carried
  // back from the response so "Entire term" can resolve its dates.
  const [preset, setPreset]         = useState<Preset>('this-week');
  const [custom, setCustom]         = useState({ start: today, end: today });
  const [termBounds, setTermBounds] = useState<{ start: string | null; end: string | null }>({ start: null, end: null });
  const range = presetRange(preset, custom, termBounds);

  // Attendance coverage is an oversight view for admins/headmasters only — a
  // restricted teacher neither sees the strip nor fetches it.
  const fetchCoverage = useCallback(
    () => restricted
      ? Promise.resolve<CoverageResponse | null>(null)
      : staffApi.get<CoverageResponse>(`/school/attendance/coverage?start=${range.start}&end=${range.end}`).catch(() => null),
    [restricted, range.start, range.end],
  );

  const { data: allClasses }                            = useApi(fetchClasses);
  const { data: attendance, loading, refetch }          = useApi(fetchAttendance, `${classId}:${date}`);
  const { data: coverage, refetch: refetchCoverage }    = useApi(fetchCoverage, `${restricted}:${range.start}:${range.end}`);

  // Carry the active-term bounds back so the "Entire term" preset can resolve.
  useEffect(() => {
    if (coverage && (coverage.termStart !== termBounds.start || coverage.termEnd !== termBounds.end)) {
      setTermBounds({ start: coverage.termStart, end: coverage.termEnd });
    }
  }, [coverage]); // eslint-disable-line react-hooks/exhaustive-deps

  // Missing school-days per class over the selected range (drives the tab badges).
  const missingByClass = new Map((coverage?.classes ?? []).map(c => [c.id, c.missingCount]));

  // Unwrap the backend response into a flat StudentRecord array
  const records: StudentRecord[] = (attendance?.students ?? []).map(({ student, record }) => ({
    student,
    status: record?.status ?? null,
    existingRecordId: record?.id ?? null,
  }));

  // For restricted teachers, only show their assigned classes
  const classes = restricted
    ? (allClasses ?? []).filter(c => assignedClassIds.includes(c.id))
    : (allClasses ?? []);

  // Auto-select the first class once classes load
  useEffect(() => {
    if (!classId && classes.length > 0) setClassId(classes[0].id);
  }, [classes]);

  const isSchoolDay = attendance?.isSchoolDay ?? true;

  // Re-initialise statuses whenever a new attendance response arrives
  const [lastKey, setLastKey] = useState('');
  const currentKey = `${classId}:${date}`;
  if (!loading && currentKey !== lastKey) {
    const init: Record<string, AttendanceStatus> = {};
    records.forEach(r => { if (r.status) init[r.student.id] = r.status; });
    setStatuses(init);
    setLastKey(currentKey);
  }

  function handleClassChange(id: string) { setClassId(id); setStatuses({}); }
  function handleDateChange(d: string)   { setDate(d);    setStatuses({}); }
  function jumpTo(id: string, d: string) { setClassId(id); setDate(d); setStatuses({}); }

  function markAll(status: AttendanceStatus) {
    if (!records) return;
    const all: Record<string, AttendanceStatus> = {};
    records.forEach(r => { all[r.student.id] = status; });
    setStatuses(all);
  }

  async function save() {
    if (!classId || !records) return;
    setAlert(null); setSaving(true);
    try {
      const entries = records.map(r => ({
        studentId: r.student.id,
        status:    statuses[r.student.id] ?? 'ABSENT',
      }));
      await staffApi.post('/school/attendance/students/bulk', { classId, date, entries });
      setAlert({ type: 'success', message: `Attendance saved for ${entries.length} students.` });
      refetch();
      refetchCoverage();
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Failed to save attendance.' });
    } finally {
      setSaving(false);
    }
  }

  const presentCount = Object.values(statuses).filter(s => s === 'PRESENT' || s === 'LATE').length;
  const absentCount  = Object.values(statuses).filter(s => s === 'ABSENT').length;
  const total        = records?.length ?? 0;

  return (
    <div>
      {!restricted && (
        <CoverageStrip
          data={coverage ?? null}
          today={today}
          onJump={jumpTo}
          range={
            <RangeControl
              preset={preset} onPreset={setPreset}
              custom={custom} onCustom={setCustom}
              termAvailable={!!termBounds.start}
            />
          }
        />
      )}

      {/* Date + mark-all row */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <input type="date" value={date} onChange={e => handleDateChange(e.target.value)}
          max={today}
          className="px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none"
          onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
          onBlur={e => e.currentTarget.style.boxShadow = ''} />
        {records && records.length > 0 && (
          <div className="flex gap-2 ml-auto">
            <button onClick={() => markAll('PRESENT')}
              className="px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition">
              Mark all present
            </button>
            <button onClick={() => markAll('ABSENT')}
              className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition">
              Mark all absent
            </button>
          </div>
        )}
      </div>

      {/* Class tabs */}
      {classes && classes.length > 0 && (
        <div className="flex gap-1 mb-6 border-b border-slate-200 overflow-x-auto scrollbar-none">
          {classes.map(c => {
            const active = classId === c.id;
            const missing = missingByClass.get(c.id) ?? 0;
            return (
              <button
                key={c.id}
                onClick={() => handleClassChange(c.id)}
                className="shrink-0 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap flex items-center gap-1.5"
                style={active
                  ? { color: 'var(--accent)', borderColor: 'var(--accent)' }
                  : { color: '#64748b', borderColor: 'transparent' }}
              >
                {c.name}
                {missing > 0 && (
                  <span
                    title={`${missing} school ${missing === 1 ? 'day' : 'days'} not marked`}
                    className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-red-50 text-red-600 text-[11px] font-semibold leading-none"
                  >
                    {missing}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {alert && <div className="mb-4"><Alert type={alert.type} message={alert.message} /></div>}

      {classId && !loading && !isSchoolDay && (
        <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
          This date is not a school day. Attendance cannot be marked.
        </div>
      )}

      {!classId && classes && classes.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 px-6 py-16 text-center text-sm text-slate-400">
          {restricted
            ? 'You are not the class teacher of any class, so there is no attendance for you to take.'
            : 'No classes found. Set up your grade structure first.'}
        </div>
      )}

      {!classId && classes && classes.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 px-6 py-16 text-center text-sm text-slate-400">
          Select a class above to take attendance.
        </div>
      )}

      {classId && (
        <>
          {/* Summary chips */}
          {total > 0 && (
            <div className="flex gap-3 mb-4">
              {[
                { label: 'Present / Late', count: presentCount, color: '#22c55e' },
                { label: 'Absent', count: absentCount, color: '#ef4444' },
                { label: 'Not marked', count: total - Object.keys(statuses).length, color: '#94a3b8' },
              ].map(chip => (
                <div key={chip.label} className="bg-white rounded-xl border border-slate-100 px-4 py-2.5 text-center">
                  <p className="text-xs text-slate-400">{chip.label}</p>
                  <p className="text-xl font-bold" style={{ color: chip.color }}>{chip.count}</p>
                </div>
              ))}
              <div className="bg-white rounded-xl border border-slate-100 px-4 py-2.5 text-center">
                <p className="text-xs text-slate-400">Total</p>
                <p className="text-xl font-bold text-slate-700">{total}</p>
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Student</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Attendance</th>
                </tr>
              </thead>
              <tbody>
                {loading && Array.from({length:8}).map((_,i) => (
                  <tr key={i} className="border-b border-slate-50">
                    <td colSpan={2} className="px-4 py-3.5"><div className="h-7 bg-slate-100 rounded animate-pulse" /></td>
                  </tr>
                ))}
                {!loading && records?.map(record => {
                  const status = statuses[record.student.id] ?? null;
                  const cfg = status ? STATUS_CONFIG[status] : null;
                  return (
                    <tr key={record.student.id} className="border-b border-slate-50 hover:bg-slate-50/40 transition">
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-slate-800">
                          {record.student.lastName}, {record.student.firstName}
                        </p>
                        <p className="text-xs font-mono text-slate-400">{record.student.studentId}</p>
                      </td>
                      <td className="px-4 py-3">
                        <StatusToggle
                          status={status}
                          onChange={s => setStatuses(prev => ({ ...prev, [record.student.id]: s }))}
                        />
                      </td>
                    </tr>
                  );
                })}
                {!loading && (!records || records.length === 0) && (
                  <tr><td colSpan={2} className="px-4 py-12 text-center text-sm text-slate-400">
                    No students in this class.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          {records && records.length > 0 && isSchoolDay && (
            <div className="mt-4 flex justify-end">
              <SaveButton loading={saving} onClick={save} label="Save attendance" />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AttendancePage() {
  const scope = useTeacherScope();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Attendance</h1>
          <p className="text-sm text-slate-500 mt-0.5">Mark and track daily attendance.</p>
        </div>
      </div>

      {/* Staff attendance removed for now — student attendance only. */}
      <StudentAttendanceTab
        assignedClassIds={scope.classTeacherClassIds}
        restricted={scope.restricted}
      />
    </div>
  );
}
