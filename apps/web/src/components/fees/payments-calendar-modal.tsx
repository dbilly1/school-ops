'use client';

import { useState, useCallback, useEffect } from 'react';
import { staffApi, type ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { Alert } from '@/components/ui/settings-card';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/cn';

// Shared per-student payment calendar for transport & feeding fees. Both expose
// the same endpoints under a different base path (e.g. /school/transport-fees or
// /school/feeding): GET student/:id/calendar, POST mark-paid|prepay|refund-balance|settle-arrears.

export type CalendarStatus = 'PAID' | 'PRE_COVERED' | 'ABSENT' | 'UNPAID' | 'NON_SCHOOL' | 'PROJECTED' | 'NONE';
export type CalendarDay = { date: string; isSchoolDay: boolean; status: CalendarStatus };
export type StudentCalendar = {
  studentId: string;
  student: { id: string; studentId: string; firstName: string; lastName: string };
  month: string;
  dailyRate: number;
  balance: number;
  owedDays: number;
  owedAmount: number;
  days: CalendarDay[];
};

export const CAL_CONFIG: Record<CalendarStatus, { label: string; color: string; bg: string; border: string }> = {
  PAID:        { label: 'Paid',       color: '#15803d', bg: '#dcfce7', border: '#bbf7d0' },
  PRE_COVERED: { label: 'Prepaid',    color: '#1d4ed8', bg: '#dbeafe', border: '#bfdbfe' },
  PROJECTED:   { label: 'Projected',  color: '#3b82f6', bg: '#eff6ff', border: '#dbeafe' },
  UNPAID:      { label: 'Unpaid',     color: '#b91c1c', bg: '#fee2e2', border: '#fecaca' },
  ABSENT:      { label: 'Absent',     color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' },
  NON_SCHOOL:  { label: 'Non-school', color: '#cbd5e1', bg: '#f8fafc', border: '#f1f5f9' },
  NONE:        { label: '—',          color: '#94a3b8', bg: '#ffffff', border: '#f1f5f9' },
};

export function PaymentsCalendarModal({ basePath, heading, studentId, studentName, onClose, onChanged }: {
  basePath: string;
  heading: string;
  studentId: string;
  studentName: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const todayKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  const [month, setMonth]   = useState(`${now.getFullYear()}-${pad(now.getMonth() + 1)}`);
  const [view, setView]     = useState<'month' | 'week'>('month');
  const [weekIdx, setWeekIdx] = useState(0);
  const [addDays, setAddDays] = useState(1);
  const [refundDays, setRefundDays] = useState(1);
  const [showRefund, setShowRefund] = useState(false);
  const [busy, setBusy]     = useState(false);
  const [alert, setAlert]   = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  const fetchCal = useCallback(
    () => staffApi.get<StudentCalendar>(`${basePath}/student/${studentId}/calendar?month=${month}`),
    [basePath, studentId, month],
  );
  const { data: cal, loading, refetch } = useApi(fetchCal, `${studentId}:${month}`);

  // Build Sun–Sat week rows from the month's days
  const weeks: (CalendarDay | null)[][] = [];
  if (cal && cal.days.length) {
    const firstWeekday = new Date(`${cal.days[0].date}T00:00:00`).getDay();
    let week: (CalendarDay | null)[] = Array(firstWeekday).fill(null);
    for (const d of cal.days) {
      week.push(d);
      if (week.length === 7) { weeks.push(week); week = []; }
    }
    if (week.length) { while (week.length < 7) week.push(null); weeks.push(week); }
  }

  useEffect(() => {
    if (view === 'week' && weeks.length) {
      const idx = weeks.findIndex(w => w.some(d => d?.date === todayKey));
      setWeekIdx(idx >= 0 ? idx : 0);
    }
  }, [view, cal]); // eslint-disable-line react-hooks/exhaustive-deps

  function shiftMonth(delta: number) {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
    setWeekIdx(0);
  }

  const rate    = cal?.dailyRate ?? 0;
  const balance = cal?.balance ?? 0;
  const owedDays   = cal?.owedDays ?? 0;
  const owedAmount = cal?.owedAmount ?? 0;
  const monthLabel = new Date(`${month}-01T00:00:00`).toLocaleString('en', { month: 'long', year: 'numeric' });
  const shownWeeks = view === 'week' ? weeks.slice(weekIdx, weekIdx + 1) : weeks;

  async function act(run: () => Promise<unknown>, success?: string) {
    setBusy(true); setAlert(null);
    try {
      await run();
      await refetch(); onChanged();
      if (success) setAlert({ type: 'success', message: success });
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Something went wrong.' });
    } finally { setBusy(false); }
  }

  function dayCell(d: CalendarDay | null, i: number) {
    if (!d) return <div key={i} />;
    const cfg = CAL_CONFIG[d.status];
    const dayNum = Number(d.date.split('-')[2]);
    const isToday = d.date === todayKey;
    const settleable = d.status === 'UNPAID' && d.date <= todayKey && d.isSchoolDay;
    return (
      <button key={i} type="button" disabled={!settleable || busy}
        onClick={() => settleable && act(() => staffApi.post(`${basePath}/mark-paid`, { studentId, date: d.date }))}
        title={settleable ? 'Mark this day paid (cash)' : cfg.label}
        className={cn(
          'aspect-square rounded-lg flex flex-col items-center justify-center text-xs leading-none gap-0.5 transition',
          settleable ? 'cursor-pointer hover:ring-2 hover:ring-emerald-300' : 'cursor-default',
        )}
        style={{ backgroundColor: cfg.bg, color: cfg.color, border: `${isToday ? 2 : 1}px solid ${isToday ? 'var(--accent)' : cfg.border}` }}>
        <span className="font-semibold">{dayNum}</span>
        {d.status === 'PAID' && <span>✓</span>}
        {d.status === 'PRE_COVERED' && <span>●</span>}
        {d.status === 'PROJECTED' && <span>◌</span>}
      </button>
    );
  }

  return (
    <Modal open onClose={onClose} title={`${heading} — ${studentName}`} width="max-w-xl">
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="px-3 py-1.5 rounded-lg text-sm font-semibold" style={{ backgroundColor: '#eff6ff', color: '#1d4ed8' }}>
              Prepaid balance: {balance} day{balance === 1 ? '' : 's'}
            </div>
            {owedAmount > 0 && (
              <div className="px-3 py-1.5 rounded-lg text-sm font-semibold" style={{ backgroundColor: '#fffbeb', color: '#b45309' }}>
                Owes: GHS {owedAmount.toFixed(2)}
              </div>
            )}
          </div>
          <div className="flex bg-slate-100 rounded-lg p-0.5">
            {(['month', 'week'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={cn('px-3 py-1 rounded-md text-xs font-medium capitalize transition',
                  view === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500')}>{v}</button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <button onClick={() => view === 'week' ? setWeekIdx(i => Math.max(0, i - 1)) : shiftMonth(-1)}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-500 text-lg leading-none">‹</button>
          <p className="text-sm font-semibold text-slate-700">{monthLabel}</p>
          <button onClick={() => view === 'week' ? setWeekIdx(i => Math.min(weeks.length - 1, i + 1)) : shiftMonth(1)}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-500 text-lg leading-none">›</button>
        </div>

        <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] font-semibold text-slate-400 uppercase">
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div key={d}>{d}</div>)}
        </div>

        {loading ? (
          <div className="h-44 bg-slate-50 rounded-xl animate-pulse" />
        ) : (
          <div className="space-y-1.5">
            {shownWeeks.map((w, wi) => (
              <div key={wi} className="grid grid-cols-7 gap-1.5">{w.map((d, di) => dayCell(d, di))}</div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
          {(['PAID','PRE_COVERED','PROJECTED','UNPAID','ABSENT','NON_SCHOOL'] as CalendarStatus[]).map(s => (
            <span key={s} className="flex items-center gap-1">
              <span className="w-3 h-3 rounded" style={{ backgroundColor: CAL_CONFIG[s].bg, border: `1px solid ${CAL_CONFIG[s].border}` }} />
              {CAL_CONFIG[s].label}
            </span>
          ))}
        </div>

        {alert && <Alert type={alert.type} message={alert.message} />}

        {owedAmount > 0 && (
          <div className="flex items-center justify-between gap-3 px-3.5 py-3 rounded-xl bg-amber-50 border border-amber-200">
            <span className="text-sm text-amber-800">
              Outstanding arrears: <span className="font-semibold">GHS {owedAmount.toFixed(2)}</span> ({owedDays} day{owedDays === 1 ? '' : 's'})
            </span>
            <button onClick={() => act(() => staffApi.post(`${basePath}/settle-arrears`, { studentId }), `Settled GHS ${owedAmount.toFixed(2)} of arrears.`)}
              disabled={busy}
              className="shrink-0 px-3.5 py-2 rounded-lg text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 transition disabled:opacity-50">
              {busy ? '…' : 'Settle all'}
            </button>
          </div>
        )}

        <div className="border-t border-slate-100 pt-4 space-y-3">
          <p className="text-sm font-semibold text-slate-700">Add prepaid days</p>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center border border-slate-200 rounded-lg">
              <button onClick={() => setAddDays(d => Math.max(1, d - 1))} className="px-3 py-1.5 text-slate-500 hover:bg-slate-50">−</button>
              <input type="number" min={1} value={addDays}
                onChange={e => setAddDays(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-14 text-center text-sm py-1.5 outline-none" />
              <button onClick={() => setAddDays(d => d + 1)} className="px-3 py-1.5 text-slate-500 hover:bg-slate-50">+</button>
            </div>
            <span className="text-sm text-slate-500">
              × GHS {rate} = <span className="font-semibold text-slate-800">GHS {(addDays * rate).toFixed(2)}</span>
            </span>
            <button onClick={() => act(() => staffApi.post(`${basePath}/prepay`, { studentId, days: addDays }), `Added ${addDays} prepaid day(s).`)}
              disabled={busy || rate <= 0}
              className="ml-auto px-4 py-2 rounded-lg text-sm font-semibold text-white transition disabled:opacity-50"
              style={{ backgroundColor: 'var(--accent)' }}>
              {busy ? '…' : 'Add payment'}
            </button>
          </div>
          {rate <= 0 && <p className="text-xs text-amber-600">No daily rate set for this student.</p>}

          {balance > 0 && (showRefund ? (
            <div className="flex items-center gap-2 text-sm flex-wrap">
              <span className="text-slate-500">Refund</span>
              <input type="number" min={1} max={balance} value={refundDays}
                onChange={e => setRefundDays(Math.min(balance, Math.max(1, parseInt(e.target.value) || 1)))}
                className="w-14 text-center text-sm py-1 border border-slate-200 rounded-lg outline-none" />
              <span className="text-slate-500">unused day(s)</span>
              <button onClick={() => act(() => staffApi.post(`${basePath}/refund-balance`, { studentId, days: refundDays }), `Refunded ${refundDays} day(s).`).then(() => setShowRefund(false))}
                disabled={busy}
                className="px-3 py-1 rounded-lg text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-50">Confirm refund</button>
              <button onClick={() => setShowRefund(false)} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
            </div>
          ) : (
            <button onClick={() => { setShowRefund(true); setRefundDays(1); }} className="text-xs text-slate-400 hover:text-red-500 transition">
              Refund unused days
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
