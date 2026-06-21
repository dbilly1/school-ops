'use client';

import { useCallback } from 'react';
import { portalApi } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { EmptyState } from '@/components/portal/empty-state';

// Matches the /portal/timetable backend shape: an object (not an array) with the
// class/term context, the config (periods + breaks), and the flat slot list.
type Slot = {
  day: string;
  periodNumber: number;
  slotType: 'LESSON' | 'BREAK' | 'FREE';
  subject: { id: string; name: string } | null;
};
type TimetableConfig = {
  periodsPerDay: number;
  schoolDays: string[];
  breaks: { afterPeriod: number; label: string | null }[];
};
type Timetable = {
  class: { name: string } | null;
  term: { name: string } | null;
  config: TimetableConfig | null;
  slots: Slot[];
} | null;

const DAY_ORDER = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const DAY_SHORT: Record<string, string> = {
  MONDAY: 'Mon', TUESDAY: 'Tue', WEDNESDAY: 'Wed',
  THURSDAY: 'Thu', FRIDAY: 'Fri', SATURDAY: 'Sat', SUNDAY: 'Sun',
};

export default function PortalTimetablePage() {
  const fetchTimetable = useCallback(
    () => portalApi.get<Timetable>('/portal/timetable').catch(() => null),
    [],
  );
  const { data, loading } = useApi(fetchTimetable);

  const slots = data?.slots ?? [];
  const days = (data?.config?.schoolDays?.length
    ? [...data.config.schoolDays]
    : [...new Set(slots.map(s => s.day))]
  ).sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));

  const periodCount = data?.config?.periodsPerDay
    ?? (slots.length ? Math.max(...slots.map(s => s.periodNumber)) : 0);
  const periods = Array.from({ length: periodCount }, (_, i) => i + 1);

  const slotMap = new Map(slots.map(s => [`${s.day}-${s.periodNumber}`, s]));
  const breakAfter = new Set((data?.config?.breaks ?? []).map(b => b.afterPeriod));

  const hasGrid = !loading && days.length > 0 && periods.length > 0;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-bold text-slate-900">Timetable</h1>
        <p className="text-xs text-slate-400 mt-0.5">
          {data?.class?.name ? `${data.class.name}${data.term?.name ? ` · ${data.term.name}` : ''}` : 'Your class schedule'}
        </p>
      </header>

      {loading && <div className="h-64 bg-slate-100 rounded-2xl animate-pulse" />}

      {!loading && !hasGrid && (
        <EmptyState icon="timetable" title="No timetable yet" subtitle="Your class schedule will appear here once it’s published." />
      )}

      {hasGrid && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-2 overflow-x-auto">
          <table className="w-full border-separate" style={{ borderSpacing: '4px' }}>
            <thead>
              <tr>
                <th className="w-7 text-[10px] font-semibold text-slate-300 text-center">P</th>
                {days.map(day => (
                  <th key={day} className="text-xs font-semibold text-slate-600 text-center min-w-[78px] pb-1">
                    {DAY_SHORT[day] ?? day.slice(0, 3)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {periods.map(period => (
                <PeriodRow
                  key={period}
                  period={period}
                  days={days}
                  getSlot={(day) => slotMap.get(`${day}-${period}`)}
                  breakAfter={breakAfter.has(period)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PeriodRow({
  period, days, getSlot, breakAfter,
}: {
  period: number;
  days: string[];
  getSlot: (day: string) => Slot | undefined;
  breakAfter: boolean;
}) {
  return (
    <>
      <tr>
        <td className="text-[10px] font-semibold text-slate-300 text-center align-middle">{period}</td>
        {days.map(day => {
          const slot = getSlot(day);
          if (!slot || slot.slotType === 'FREE') {
            return <td key={day}><div className="h-14 rounded-lg bg-slate-50" /></td>;
          }
          if (slot.slotType === 'BREAK') {
            return (
              <td key={day}>
                <div className="h-14 rounded-lg bg-amber-50 flex items-center justify-center">
                  <span className="text-[10px] font-medium text-amber-500">Break</span>
                </div>
              </td>
            );
          }
          return (
            <td key={day}>
              <div
                className="h-14 rounded-lg px-2 flex items-center justify-center text-center"
                style={{ backgroundColor: 'var(--accent-tint)', border: '1px solid var(--accent)' }}
              >
                <span className="text-[11px] font-semibold leading-tight line-clamp-2" style={{ color: 'var(--accent-dark)' }}>
                  {slot.subject?.name ?? '—'}
                </span>
              </div>
            </td>
          );
        })}
      </tr>
      {breakAfter && (
        <tr>
          <td />
          <td colSpan={days.length}>
            <div className="my-0.5 h-5 rounded-md bg-amber-50 flex items-center justify-center">
              <span className="text-[9px] font-semibold uppercase tracking-widest text-amber-400">Break</span>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
