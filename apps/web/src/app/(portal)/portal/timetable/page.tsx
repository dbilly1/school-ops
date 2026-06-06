'use client';

import { useCallback } from 'react';
import { portalApi } from '@/lib/api';
import { useApi } from '@/hooks/use-api';

type TimetableSlot = {
  day: string;
  periodNumber: number;
  slotType: 'lesson' | 'break' | 'free';
  subject: { name: string } | null;
  teacher: { firstName: string; lastName: string } | null;
};

const DAY_ORDER = ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
const DAY_SHORT: Record<string, string> = {
  MONDAY: 'Mon', TUESDAY: 'Tue', WEDNESDAY: 'Wed',
  THURSDAY: 'Thu', FRIDAY: 'Fri', SATURDAY: 'Sat',
};

export default function PortalTimetablePage() {
  const fetchTimetable = useCallback(() =>
    portalApi.get<TimetableSlot[]>('/portal/timetable').catch(() => []), []);
  const { data: slots, loading } = useApi(fetchTimetable);

  const days = slots
    ? [...new Set(slots.map(s => s.day))].sort((a,b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b))
    : [];
  const periods = slots
    ? [...new Set(slots.map(s => s.periodNumber))].sort((a,b) => a - b)
    : [];

  function getSlot(day: string, period: number) {
    return slots?.find(s => s.day === day && s.periodNumber === period);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Timetable</h1>
        <p className="text-xs text-slate-400 mt-0.5">Your class schedule</p>
      </div>

      {loading && <div className="h-64 bg-slate-100 rounded-xl animate-pulse" />}

      {!loading && slots && slots.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-100 px-4 py-12 text-center text-sm text-slate-400">
          No timetable configured yet.
        </div>
      )}

      {!loading && slots && slots.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="pb-2 text-xs font-semibold text-slate-400 w-8 text-center">P</th>
                {days.map(day => (
                  <th key={day} className="pb-2 text-xs font-semibold text-slate-600 text-center min-w-[80px]">
                    {DAY_SHORT[day]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {periods.map(period => (
                <tr key={period}>
                  <td className="text-[10px] font-medium text-slate-400 text-center pr-2 py-1">{period}</td>
                  {days.map(day => {
                    const slot = getSlot(day, period);
                    if (!slot || slot.slotType === 'break') {
                      return (
                        <td key={day} className="py-1 px-1">
                          <div className="h-14 bg-amber-50 rounded-lg flex items-center justify-center">
                            <span className="text-[10px] text-amber-400 font-medium">
                              {slot?.slotType === 'break' ? 'Break' : '—'}
                            </span>
                          </div>
                        </td>
                      );
                    }
                    if (slot.slotType === 'free') {
                      return (
                        <td key={day} className="py-1 px-1">
                          <div className="h-14 bg-slate-50 rounded-lg" />
                        </td>
                      );
                    }
                    return (
                      <td key={day} className="py-1 px-1">
                        <div
                          className="h-14 rounded-lg px-2 py-1.5 flex flex-col justify-between"
                          style={{ backgroundColor: 'var(--accent-tint)', border: '1px solid var(--accent)' }}
                        >
                          <p className="text-[11px] font-semibold truncate" style={{ color: 'var(--accent-dark)' }}>
                            {slot.subject?.name ?? '—'}
                          </p>
                          <p className="text-[10px] truncate" style={{ color: 'var(--accent)' }}>
                            {slot.teacher ? `${slot.teacher.firstName} ${slot.teacher.lastName[0]}.` : ''}
                          </p>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
