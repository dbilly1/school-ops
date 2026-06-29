'use client';

import { useState, useCallback, useEffect } from 'react';
import { staffApi } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { PaymentsCalendarModal } from '@/components/fees/payments-calendar-modal';
import { ExpensesPanel } from '@/components/finance/expenses-panel';
import { cn } from '@/lib/cn';

// ── Types ─────────────────────────────────────────────────────────────────────

type Student = { id: string; studentId: string; firstName: string; lastName: string };
type DailyStatus = 'PAID' | 'PRE_COVERED' | 'ABSENT' | 'UNPAID';

type CollectionRow = {
  student: Student;
  status: DailyStatus;
  dailyRate: number;
  owedDays: number;
  owedAmount: number;
};

type CollectionSummary = {
  total: number; paid: number; preCovered: number; absent: number; unpaid: number; cashCollected: number;
};

// GET /school/feeding/daily/:classId
type ClassDailyResponse = {
  date: string;
  classId: string;
  dailyRate: number;
  isSchoolDay: boolean;
  rows: CollectionRow[];
  summary: CollectionSummary;
};

type ClassOption = { id: string; name: string };

const STATUS_CONFIG: Record<DailyStatus, { label: string; color: string; bg: string }> = {
  PAID:        { label: 'Paid',        color: '#22c55e', bg: '#f0fdf4' },
  PRE_COVERED: { label: 'Pre-covered', color: '#3b82f6', bg: '#eff6ff' },
  ABSENT:      { label: 'Absent',      color: '#94a3b8', bg: '#f8fafc' },
  UNPAID:      { label: 'Unpaid',      color: '#ef4444', bg: '#fef2f2' },
};

// ── Daily collection tab ──────────────────────────────────────────────────────

function DailyCollectionTab() {
  const today = new Date().toISOString().split('T')[0];
  const [date, setDate]       = useState(today);
  const [classId, setClassId] = useState('');
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);
  const [calendarStudent, setCalendarStudent] = useState<Student | null>(null);

  const fetchClasses = useCallback(async () => {
    const list = await staffApi.get<ClassOption[]>('/school/grade-structure/classes');
    if (list.length === 0) {
      await staffApi.post('/school/grade-structure/classes/ensure', {}).catch(() => {});
      return staffApi.get<ClassOption[]>('/school/grade-structure/classes');
    }
    return list;
  }, []);
  const { data: classes } = useApi(fetchClasses);

  const fetchCollection = useCallback(
    () => classId
      ? staffApi.get<ClassDailyResponse>(`/school/feeding/daily/${classId}?date=${date}`).catch(() => null)
      : Promise.resolve(null),
    [classId, date],
  );
  const { data: collection, loading, refetch } = useApi(fetchCollection, `${classId}:${date}`);

  useEffect(() => {
    if (!classId && classes && classes.length > 0) setClassId(classes[0].id);
  }, [classes]);

  const rows        = collection?.rows ?? [];
  const summary     = collection?.summary;
  const isSchoolDay = collection?.isSchoolDay ?? true;
  const totalOwed   = rows.reduce((s, r) => s + r.owedAmount, 0);

  async function markPaid(studentId: string) {
    setMarkingPaid(studentId);
    try {
      await staffApi.post('/school/feeding/mark-paid', { studentId, date });
    } catch {
      // Stale row (e.g. already prepaid) — resync below rather than throw.
    } finally {
      setMarkingPaid(null);
      refetch();
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <input type="date" value={date} onChange={e => setDate(e.target.value)} max={today}
          className="px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none"
          onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
          onBlur={e => e.currentTarget.style.boxShadow = ''} />
      </div>

      {/* Class tabs */}
      {classes && classes.length > 0 && (
        <div className="flex gap-1 mb-6 border-b border-slate-200 overflow-x-auto scrollbar-none">
          {classes.map(c => {
            const active = classId === c.id;
            return (
              <button key={c.id} onClick={() => setClassId(c.id)}
                className="shrink-0 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap"
                style={active
                  ? { color: 'var(--accent)', borderColor: 'var(--accent)' }
                  : { color: '#64748b', borderColor: 'transparent' }}>
                {c.name}
              </button>
            );
          })}
        </div>
      )}

      {classes && classes.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 px-6 py-12 text-center text-sm text-slate-400">
          No classes found. Set up your grade structure first.
        </div>
      )}

      {classId && !loading && !isSchoolDay && (
        <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
          This date is not a school day. Payments cannot be recorded.
        </div>
      )}

      {classId && summary && (
        <div className="flex gap-4 mb-4 flex-wrap">
          {[
            { label: 'Paid', value: summary.paid, color: '#22c55e' },
            { label: 'Unpaid today', value: summary.unpaid, color: '#ef4444' },
            { label: 'Cash today', value: `GHS ${summary.cashCollected.toFixed(2)}`, color: 'var(--accent)' },
            { label: 'Outstanding', value: `GHS ${totalOwed.toFixed(2)}`, color: '#b45309' },
          ].map(c => (
            <div key={c.label} className="bg-white rounded-xl border border-slate-100 px-4 py-3 text-center">
              <p className="text-xs text-slate-400">{c.label}</p>
              <p className="text-lg font-bold" style={{ color: c.color }}>{c.value}</p>
            </div>
          ))}
        </div>
      )}

      {classId && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Student</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide">Owes</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({length:6}).map((_,i) => (
                <tr key={i}><td colSpan={4} className="px-4 py-3"><div className="h-7 bg-slate-100 rounded animate-pulse" /></td></tr>
              ))}
              {!loading && rows.map(row => {
                const cfg    = STATUS_CONFIG[row.status];
                const canPay = row.status === 'UNPAID' && isSchoolDay;
                return (
                  <tr key={row.student.id} className={cn('border-b border-slate-50', row.status === 'ABSENT' ? 'opacity-50' : 'hover:bg-slate-50/40 transition')}>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-slate-800">{row.student.lastName}, {row.student.firstName}</p>
                      <p className="text-xs font-mono text-slate-400">{row.student.studentId}</p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                        style={{ color: cfg.color, backgroundColor: cfg.bg }}>
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {row.owedAmount > 0
                        ? <span className="text-sm font-semibold text-amber-700" title={`${row.owedDays} unpaid day(s)`}>GHS {row.owedAmount.toFixed(2)}</span>
                        : <span className="text-slate-300 text-sm">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {canPay && (
                        <button onClick={() => markPaid(row.student.id)} disabled={markingPaid === row.student.id}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                          style={{ backgroundColor: '#22c55e' }}>
                          {markingPaid === row.student.id ? '…' : 'Mark paid'}
                        </button>
                      )}
                      <button onClick={() => setCalendarStudent(row.student)}
                        className="ml-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition">
                        Payments
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-slate-400">No students in this class.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {calendarStudent && (
        <PaymentsCalendarModal
          basePath="/school/feeding"
          heading="Feeding payments"
          studentId={calendarStudent.id}
          studentName={`${calendarStudent.firstName} ${calendarStudent.lastName}`}
          onClose={() => setCalendarStudent(null)}
          onChanged={refetch}
        />
      )}
    </div>
  );
}

// ── Reconciliation tab ────────────────────────────────────────────────────────

function ReconciliationTab() {
  const today = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(today);

  type ReconResponse = {
    date: string;
    cashCollectedToday: number;
    prePayments: { student: Student; amount: number; daysCovered: number }[];
    paidToday: { student: Student }[];
    totalTransactions: number;
  };

  const fetchRecon = useCallback(
    () => staffApi.get<ReconResponse>(`/school/feeding/reconciliation?date=${date}`).catch(() => null),
    [date],
  );
  const { data: recon, loading } = useApi(fetchRecon, date);

  return (
    <div>
      <div className="mb-5">
        <input type="date" value={date} max={today} onChange={e => setDate(e.target.value)}
          className="px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none"
          onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
          onBlur={e => e.currentTarget.style.boxShadow = ''} />
      </div>

      {loading && <div className="h-48 bg-slate-100 rounded-2xl animate-pulse" />}

      {!loading && !recon && (
        <div className="bg-white rounded-2xl border border-slate-100 px-6 py-12 text-center text-sm text-slate-400">
          No reconciliation data for this date.
        </div>
      )}

      {!loading && recon && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-6 py-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-5">
              Daily reconciliation — {new Date(recon.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </h3>
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-100">
              <span className="text-sm text-slate-600">Total transactions</span>
              <span className="text-sm font-bold text-slate-800">{recon.totalTransactions}</span>
            </div>
            <div className="px-4 py-3 rounded-xl" style={{ backgroundColor: 'color-mix(in srgb, var(--accent) 8%, white)' }}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>Total cash collected today</span>
                <span className="text-xl font-bold" style={{ color: 'var(--accent)' }}>GHS {Number(recon.cashCollectedToday).toFixed(2)}</span>
              </div>
              <p className="text-xs mt-1 text-slate-500">Includes prepayments, arrears settlements, and same-day cash.</p>
            </div>
          </div>

          {recon.prePayments.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Payments received</p>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Student</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide">Amount</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide">Days</th>
                  </tr>
                </thead>
                <tbody>
                  {recon.prePayments.map((p, i) => (
                    <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/40">
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {p.student.lastName}, {p.student.firstName}
                        <span className="ml-2 text-xs font-mono text-slate-400">{p.student.studentId}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-slate-700">GHS {Number(p.amount).toFixed(2)}</td>
                      <td className="px-4 py-3 text-sm text-right text-blue-600 font-medium">{p.daysCovered}d</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {recon.paidToday.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Paid cash today ({recon.paidToday.length})</p>
              </div>
              <div className="px-4 py-3 flex flex-wrap gap-2">
                {recon.paidToday.map((p, i) => (
                  <span key={i} className="text-xs bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full">
                    {p.student.firstName} {p.student.lastName}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FeedingPage() {
  const [tab, setTab] = useState<'collection' | 'expenses' | 'reconciliation'>('collection');

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Feeding Fees</h1>
          <p className="text-sm text-slate-500 mt-0.5">Daily collection, prepayments, arrears, and reconciliation.</p>
        </div>
      </div>

      <div className="flex gap-1 mb-6 bg-slate-100 p-1 rounded-xl w-fit">
        {([['collection', 'Daily Collection'], ['expenses', 'Expenses'], ['reconciliation', 'Reconciliation']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn('px-5 py-1.5 rounded-lg text-sm font-medium transition', tab === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'collection'     && <DailyCollectionTab />}
      {tab === 'expenses'       && (
        <ExpensesPanel
          endpointBase="/school/feeding"
          ownCenter="FEEDING"
          perm={{ featureKey: 'feeding_fees', subFeatureKey: 'fee_collection' }}
          summaryEndpoint="/school/feeding/expense-summary"
          streamLabel="Feeding"
        />
      )}
      {tab === 'reconciliation' && <ReconciliationTab />}
    </div>
  );
}
