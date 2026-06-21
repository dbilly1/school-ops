'use client';

import { useState, useCallback, useMemo } from 'react';
import { portalApi } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { EmptyState } from '@/components/portal/empty-state';

type Status = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
type AttendanceRecord = { date: string; status: Status };
type AttendanceResponse = {
  records: AttendanceRecord[];
  summary: { total: number; present: number; absent: number; rate: number };
};
type Term = {
  id: string;
  name: string;
  academicYearName: string;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
};

const EMPTY: AttendanceResponse = { records: [], summary: { total: 0, present: 0, absent: 0, rate: 0 } };

const STATUS_CONFIG: Record<Status, { label: string; color: string; fg: string }> = {
  PRESENT: { label: 'Present', color: '#16a34a', fg: '#fff' },
  LATE:    { label: 'Late',    color: '#f59e0b', fg: '#fff' },
  ABSENT:  { label: 'Absent',  color: '#dc2626', fg: '#fff' },
  EXCUSED: { label: 'Excused', color: '#cbd5e1', fg: '#334155' },
};

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const pad = (n: number) => String(n).padStart(2, '0');
const keyOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

export default function PortalAttendancePage() {
  // Terms (for the filter).
  const fetchTerms = useCallback(() => portalApi.get<Term[]>('/portal/terms').catch(() => []), []);
  const { data: terms } = useApi(fetchTerms);

  const [selectedTermId, setSelectedTermId] = useState<string | null>(null);
  const activeTerm = useMemo(() => {
    if (!terms || terms.length === 0) return null;
    if (selectedTermId) return terms.find(t => t.id === selectedTermId) ?? null;
    return terms.find(t => t.isActive) ?? terms[0];
  }, [terms, selectedTermId]);

  // Attendance for the selected term's date range.
  const start = activeTerm?.startDate?.slice(0, 10) ?? null;
  const end   = activeTerm?.endDate?.slice(0, 10) ?? null;

  const fetchAttendance = useCallback(
    () => (start && end)
      ? portalApi.get<AttendanceResponse>(`/portal/attendance?startDate=${start}&endDate=${end}`).catch(() => EMPTY)
      : Promise.resolve(EMPTY),
    [start, end],
  );
  const { data, loading } = useApi(fetchAttendance, `${start}|${end}`);

  const summary = data?.summary ?? EMPTY.summary;
  const statusByDate = useMemo(() => {
    const m = new Map<string, Status>();
    for (const r of data?.records ?? []) m.set(r.date.slice(0, 10), r.status);
    return m;
  }, [data]);

  const months = useMemo(() => (start && end ? monthsBetween(start, end) : []), [start, end]);
  const rateColor = summary.rate >= 80 ? '#16a34a' : summary.rate >= 60 ? '#f59e0b' : '#dc2626';

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-lg font-bold text-slate-900">Attendance</h1>
        <p className="text-xs text-slate-400 mt-0.5">Day-by-day record for the selected term</p>
      </header>

      {/* Term filter */}
      {terms && terms.length > 0 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
          {terms.map(t => {
            const active = t.id === activeTerm?.id;
            return (
              <button
                key={t.id}
                onClick={() => setSelectedTermId(t.id)}
                className="px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition shrink-0"
                style={active
                  ? { backgroundColor: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff' }
                  : { borderColor: '#e2e8f0', color: '#475569', backgroundColor: '#fff' }}
              >
                {t.name} <span className="opacity-60">· {t.academicYearName}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Summary */}
      {!loading && (
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Rate" value={`${summary.rate}%`} color={rateColor} />
          <Stat label="Present" value={summary.present} color="#16a34a" />
          <Stat label="Absent" value={summary.absent} color="#dc2626" />
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {(Object.keys(STATUS_CONFIG) as Status[]).map(s => (
          <div key={s} className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded" style={{ backgroundColor: STATUS_CONFIG[s].color }} />
            <span className="text-[11px] text-slate-500">{STATUS_CONFIG[s].label}</span>
          </div>
        ))}
      </div>

      {loading && <div className="h-72 bg-slate-100 rounded-2xl animate-pulse" />}

      {!loading && (!activeTerm || months.length === 0) && (
        <EmptyState icon="attendance" title="No term dates set" subtitle="The calendar appears once this term has start and end dates." />
      )}

      {/* Calendar grid — responsive: 1 col on mobile, up to 3 on desktop */}
      {!loading && months.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {months.map(({ year, month }) => (
            <MonthGrid
              key={`${year}-${month}`}
              year={year}
              month={month}
              startKey={start!}
              endKey={end!}
              statusByDate={statusByDate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-3 py-4 text-center">
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className="text-2xl font-bold" style={{ color }}>{value}</p>
    </div>
  );
}

function MonthGrid({
  year, month, startKey, endKey, statusByDate,
}: {
  year: number;
  month: number;
  startKey: string;
  endKey: string;
  statusByDate: Map<string, Status>;
}) {
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const firstWeekday = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7; // Mon = 0
  const monthName = new Date(Date.UTC(year, month, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
      <p className="text-sm font-semibold text-slate-800 mb-3">{monthName}</p>
      <div className="grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map((d, i) => (
          <div key={i} className="text-center text-[10px] font-medium text-slate-300">{d}</div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={`e${i}`} />;
          const key = keyOf(year, month, day);
          const inTerm = key >= startKey && key <= endKey;
          const status = statusByDate.get(key);
          const cfg = status ? STATUS_CONFIG[status] : null;
          return (
            <div
              key={key}
              title={status ? STATUS_CONFIG[status].label : undefined}
              className="aspect-square rounded-lg flex items-center justify-center text-[11px] font-medium"
              style={cfg
                ? { backgroundColor: cfg.color, color: cfg.fg }
                : { backgroundColor: inTerm ? '#f1f5f9' : 'transparent', color: inTerm ? '#94a3b8' : '#cbd5e1' }}
            >
              {day}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Inclusive list of {year, month} between two yyyy-mm-dd keys.
function monthsBetween(startKey: string, endKey: string): { year: number; month: number }[] {
  const [sy, sm] = startKey.split('-').map(Number);
  const [ey, em] = endKey.split('-').map(Number);
  const out: { year: number; month: number }[] = [];
  let y = sy, m = sm - 1;
  const endY = ey, endM = em - 1;
  while (y < endY || (y === endY && m <= endM)) {
    out.push({ year: y, month: m });
    m++;
    if (m > 11) { m = 0; y++; }
    if (out.length > 24) break; // safety
  }
  return out;
}
