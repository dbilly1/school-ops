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

type StaffRecord = {
  user: { id: string; firstName: string; lastName: string; roles: { role: string }[] };
  status: AttendanceStatus | null;
};

const STATUS_CONFIG: Record<AttendanceStatus, { label: string; color: string; bg: string }> = {
  PRESENT: { label: 'Present', color: '#22c55e', bg: '#f0fdf4' },
  LATE:    { label: 'Late',    color: '#f59e0b', bg: '#fffbeb' },
  ABSENT:  { label: 'Absent',  color: '#ef4444', bg: '#fef2f2' },
  EXCUSED: { label: 'Excused', color: '#64748b', bg: '#f8fafc' },
};

const STATUSES: AttendanceStatus[] = ['PRESENT', 'LATE', 'ABSENT', 'EXCUSED'];

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

  const { data: allClasses }                         = useApi(fetchClasses);
  const { data: attendance, loading, refetch }       = useApi(fetchAttendance, `${classId}:${date}`);

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
            return (
              <button
                key={c.id}
                onClick={() => handleClassChange(c.id)}
                className="shrink-0 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap"
                style={active
                  ? { color: 'var(--accent)', borderColor: 'var(--accent)' }
                  : { color: '#64748b', borderColor: 'transparent' }}
              >
                {c.name}
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
          No classes found. Set up your grade structure first.
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

// ── Staff attendance tab ──────────────────────────────────────────────────────

function StaffAttendanceTab() {
  const today = new Date().toISOString().split('T')[0];
  const [date, setDate]       = useState(today);
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>({});
  const [saving, setSaving]   = useState(false);
  const [alert, setAlert]     = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  const fetchRecords = useCallback(
    () => staffApi.get<StaffRecord[]>(`/school/attendance/staff?date=${date}`).catch(() => []),
    [date],
  );
  const { data: records, loading, refetch } = useApi(fetchRecords);

  const [initialised, setInitialised] = useState(false);
  if (!loading && records && !initialised) {
    const init: Record<string, AttendanceStatus> = {};
    records.forEach(r => { if (r.status) init[r.user.id] = r.status; });
    setStatuses(init);
    setInitialised(true);
  }

  function handleDateChange(d: string) {
    setDate(d);
    setInitialised(false);
    setStatuses({});
  }

  async function save() {
    if (!records) return;
    setAlert(null); setSaving(true);
    try {
      const entries = records.map(r => ({
        userId: r.user.id,
        date,
        status: statuses[r.user.id] ?? 'ABSENT',
      }));
      await staffApi.post('/school/attendance/staff', { records: entries });
      setAlert({ type: 'success', message: `Staff attendance saved.` });
      refetch();
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Failed to save.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <input type="date" value={date} onChange={e => handleDateChange(e.target.value)} max={today}
          className="px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none"
          onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
          onBlur={e => e.currentTarget.style.boxShadow = ''} />
      </div>

      {alert && <div className="mb-4"><Alert type={alert.type} message={alert.message} /></div>}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Staff member</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Roles</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Attendance</th>
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({length:6}).map((_,i) => (
              <tr key={i} className="border-b border-slate-50">
                <td colSpan={3} className="px-4 py-3"><div className="h-7 bg-slate-100 rounded animate-pulse" /></td>
              </tr>
            ))}
            {!loading && records?.map(record => (
              <tr key={record.user.id} className="border-b border-slate-50 hover:bg-slate-50/40 transition">
                <td className="px-4 py-3">
                  <p className="text-sm font-medium text-slate-800">
                    {record.user.firstName} {record.user.lastName}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {record.user.roles.map(r => (
                      <span key={r.role} className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded capitalize">
                        {r.role.replace('_', ' ').toLowerCase()}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <StatusToggle
                    status={statuses[record.user.id] ?? null}
                    onChange={s => setStatuses(p => ({ ...p, [record.user.id]: s }))}
                  />
                </td>
              </tr>
            ))}
            {!loading && (!records || records.length === 0) && (
              <tr><td colSpan={3} className="px-4 py-12 text-center text-sm text-slate-400">No staff found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {records && records.length > 0 && (
        <div className="mt-4 flex justify-end">
          <SaveButton loading={saving} onClick={save} label="Save attendance" />
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AttendancePage() {
  const scope  = useTeacherScope();
  const [tab, setTab] = useState<'students' | 'staff'>('students');

  // Restricted teachers only see the students tab
  const availableTabs = scope.restricted
    ? (['students'] as const)
    : (['students', 'staff'] as const);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Attendance</h1>
          <p className="text-sm text-slate-500 mt-0.5">Mark and track daily attendance.</p>
        </div>
      </div>

      {/* Tab switcher — hide when only one tab is available */}
      {!scope.restricted && (
        <div className="flex gap-1 mb-6 bg-slate-100 p-1 rounded-xl w-fit">
          {availableTabs.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={cn(
                'px-5 py-1.5 rounded-lg text-sm font-medium transition capitalize',
                tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
              )}>
              {t}
            </button>
          ))}
        </div>
      )}

      {(tab === 'students' || scope.restricted) && (
        <StudentAttendanceTab
          assignedClassIds={scope.assignedClassIds}
          restricted={scope.restricted}
        />
      )}
      {tab === 'staff' && !scope.restricted && <StaffAttendanceTab />}
    </div>
  );
}
