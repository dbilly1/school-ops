'use client';

import { useState, useCallback } from 'react';
import { staffApi, type ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { SaveButton, Alert, FormField, Input } from '@/components/ui/settings-card';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/cn';

// ── Types ─────────────────────────────────────────────────────────────────────

type DailyStatus = 'PAID' | 'PRE_COVERED' | 'ABSENT' | 'UNPAID';

type CollectionRow = {
  student: { id: string; studentId: string; firstName: string; lastName: string };
  status: DailyStatus;
  prePaymentBalance: number;
  dailyRate: number;
};

type ClassCollection = {
  classId: string;
  className: string;
  rows: CollectionRow[];
};

// Response from GET /school/feeding/daily (all classes)
type SchoolDailyResponse = {
  date: string;
  isSchoolDay: boolean;
  classes: ClassCollection[];
  summary: CollectionSummary;
};

// Response from GET /school/feeding/daily/:classId
type ClassDailyResponse = {
  date: string;
  classId: string;
  isSchoolDay: boolean;
  rows: CollectionRow[];
  summary: CollectionSummary;
};

type CollectionSummary = {
  total: number;
  paid: number;
  preCovered: number;
  absent: number;
  unpaid: number;
  cashCollected: number;
};

type ClassOption = { id: string; name: string };

const STATUS_CONFIG: Record<DailyStatus, { label: string; color: string; bg: string }> = {
  PAID:        { label: 'Paid',        color: '#22c55e', bg: '#f0fdf4' },
  PRE_COVERED: { label: 'Pre-covered', color: '#3b82f6', bg: '#eff6ff' },
  ABSENT:      { label: 'Absent',      color: '#94a3b8', bg: '#f8fafc' },
  UNPAID:      { label: 'Unpaid',      color: '#ef4444', bg: '#fef2f2' },
};

// ── Pre-payment modal ─────────────────────────────────────────────────────────

function PrePaymentModal({ open, onClose, student, onRecorded }: {
  open: boolean; onClose: () => void;
  student: CollectionRow['student'] & { dailyRate: number }; onRecorded: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const daysCovered = amount && student.dailyRate > 0
    ? Math.floor(parseFloat(amount) / student.dailyRate)
    : 0;

  async function record() {
    if (!amount) { setError('Enter an amount.'); return; }
    setError(null); setSaving(true);
    try {
      await staffApi.post('/school/feeding/pre-payment', {
        studentId: student.id,
        amount: parseFloat(amount),
      });
      onRecorded(); onClose();
    } catch (err) {
      setError((err as ApiError).message ?? 'Failed to record pre-payment.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Pre-payment — ${student.firstName} ${student.lastName}`}>
      <div className="space-y-4">
        {error && <Alert type="error" message={error} />}
        <FormField label="Amount received (GHS)" required>
          <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" min="0" step="0.01" />
        </FormField>
        {daysCovered > 0 && (
          <div className="px-3.5 py-2.5 rounded-lg bg-blue-50 border border-blue-100 text-sm text-blue-700">
            This covers <strong>{daysCovered} school day{daysCovered !== 1 ? 's' : ''}</strong> at GHS {student.dailyRate}/day.
          </div>
        )}
        <div className="flex justify-end pt-2">
          <SaveButton loading={saving} onClick={record} label="Record pre-payment" />
        </div>
      </div>
    </Modal>
  );
}

// ── Summary chips ─────────────────────────────────────────────────────────────

function SummaryChips({ summary }: { summary: CollectionSummary }) {
  return (
    <div className="grid grid-cols-5 gap-3 mb-5">
      {[
        { label: 'Paid',           count: summary.paid,                          color: '#22c55e' },
        { label: 'Pre-covered',    count: summary.preCovered,                    color: '#3b82f6' },
        { label: 'Absent',         count: summary.absent,                        color: '#94a3b8' },
        { label: 'Unpaid',         count: summary.unpaid,                        color: '#ef4444' },
        { label: 'Cash collected', count: `GHS ${summary.cashCollected.toFixed(2)}`, color: 'var(--accent)' },
      ].map(chip => (
        <div key={chip.label} className="bg-white rounded-xl border border-slate-100 px-4 py-3 text-center">
          <p className="text-xs text-slate-400">{chip.label}</p>
          <p className="text-lg font-bold" style={{ color: chip.color }}>{chip.count}</p>
        </div>
      ))}
    </div>
  );
}

// ── Collection table ──────────────────────────────────────────────────────────

function CollectionTable({ rows, date, onMarkPaid, markingPaid, onPrePay }: {
  rows: CollectionRow[];
  date: string;
  onMarkPaid: (studentId: string) => void;
  markingPaid: string | null;
  onPrePay: (student: CollectionRow['student'] & { dailyRate: number }) => void;
}) {
  if (rows.length === 0) {
    return (
      <tr>
        <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400">
          No enrolled students.
        </td>
      </tr>
    );
  }

  return (
    <>
      {rows.map(entry => {
        const cfg = STATUS_CONFIG[entry.status];
        const canPay = entry.status === 'UNPAID';
        return (
          <tr key={entry.student.id} className={cn('border-b border-slate-50 transition', entry.status === 'ABSENT' ? 'opacity-50' : 'hover:bg-slate-50/40')}>
            <td className="px-4 py-3">
              <p className="text-sm font-medium text-slate-800">
                {entry.student.lastName}, {entry.student.firstName}
              </p>
              <p className="text-xs font-mono text-slate-400">{entry.student.studentId}</p>
            </td>
            <td className="px-4 py-3 text-center">
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                style={{ color: cfg.color, backgroundColor: cfg.bg }}>
                {cfg.label}
              </span>
            </td>
            <td className="px-4 py-3 text-center">
              {entry.prePaymentBalance > 0
                ? <span className="text-sm font-medium text-blue-600">{entry.prePaymentBalance}d</span>
                : <span className="text-sm text-slate-300">—</span>
              }
            </td>
            <td className="px-4 py-3 text-right">
              <span className="text-xs text-slate-500">GHS {entry.dailyRate}</span>
            </td>
            <td className="px-4 py-3">
              <div className="flex items-center justify-end gap-2">
                {canPay && (
                  <button onClick={() => onMarkPaid(entry.student.id)} disabled={markingPaid === entry.student.id}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition disabled:opacity-50"
                    style={{ backgroundColor: '#22c55e' }}>
                    {markingPaid === entry.student.id ? '…' : 'Mark paid'}
                  </button>
                )}
                {entry.status !== 'ABSENT' && (
                  <button onClick={() => onPrePay({ ...entry.student, dailyRate: entry.dailyRate })}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition">
                    Pre-pay
                  </button>
                )}
              </div>
            </td>
          </tr>
        );
      })}
    </>
  );
}

// ── Daily collection tab ──────────────────────────────────────────────────────

function DailyCollectionTab() {
  const today = new Date().toISOString().split('T')[0];
  const [date, setDate]       = useState(today);
  const [classId, setClassId] = useState('ALL');
  const [prePayStudent, setPrePayStudent] = useState<(CollectionRow['student'] & { dailyRate: number }) | null>(null);
  const [markingPaid, setMarkingPaid]     = useState<string | null>(null);

  // Classes list (active year, from grade structure)
  const fetchClasses = useCallback(async () => {
    const list = await staffApi.get<ClassOption[]>('/school/grade-structure/classes');
    if (list.length === 0) {
      await staffApi.post('/school/grade-structure/classes/ensure', {}).catch(() => {});
      return staffApi.get<ClassOption[]>('/school/grade-structure/classes');
    }
    return list;
  }, []);
  const { data: classes } = useApi(fetchClasses);

  // Collection data — switches endpoint based on selection
  const fetchCollection = useCallback(() => {
    if (classId === 'ALL') {
      return staffApi
        .get<SchoolDailyResponse>(`/school/feeding/daily?date=${date}`)
        .catch(() => null);
    }
    return staffApi
      .get<ClassDailyResponse>(`/school/feeding/daily/${classId}?date=${date}`)
      .then(res => ({
        ...res,
        // Normalise single-class response to the same shape as school-wide
        classes: [{ classId: res.classId, className: '', rows: res.rows }],
      } as SchoolDailyResponse))
      .catch(() => null);
  }, [classId, date]);

  const { data: collection, loading, refetch } = useApi(fetchCollection);

  async function markPaid(studentId: string) {
    setMarkingPaid(studentId);
    try {
      await staffApi.post('/school/feeding/mark-paid', { studentId, date });
      refetch();
    } finally {
      setMarkingPaid(null);
    }
  }

  const summary = collection?.summary;
  const classesData = collection?.classes ?? [];

  // When a single class is selected, inject the class name from the dropdown list
  const classesDisplay = classId === 'ALL'
    ? classesData
    : classesData.map(c => ({ ...c, className: classes?.find(cl => cl.id === c.classId)?.name ?? c.className }));

  return (
    <div>
      {/* Filters */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <input
          type="date" value={date} max={today}
          onChange={e => setDate(e.target.value)}
          className="px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none"
          onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
          onBlur={e => e.currentTarget.style.boxShadow = ''}
        />
        <select
          value={classId}
          onChange={e => setClassId(e.target.value)}
          className="px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none"
        >
          <option value="ALL">All classes</option>
          {classes?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Summary */}
      {summary && <SummaryChips summary={summary} />}

      {/* Loading skeleton */}
      {loading && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <table className="w-full">
            <tbody>
              {Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-slate-50">
                  <td colSpan={5} className="px-4 py-3">
                    <div className="h-7 bg-slate-100 rounded animate-pulse" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tables — one per class (or a single merged table) */}
      {!loading && classesDisplay.map((cls, idx) => (
        <div key={cls.classId} className={cn('bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden', idx > 0 && 'mt-4')}>
          {/* Class header — only shown in "All classes" view */}
          {classId === 'ALL' && (
            <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{cls.className}</p>
            </div>
          )}
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Student</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">Balance (days)</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide">Rate</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              <CollectionTable
                rows={cls.rows}
                date={date}
                onMarkPaid={markPaid}
                markingPaid={markingPaid}
                onPrePay={setPrePayStudent}
              />
            </tbody>
          </table>
        </div>
      ))}

      {/* Empty state */}
      {!loading && classesDisplay.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 px-6 py-16 text-center text-sm text-slate-400">
          {!classes || classes.length === 0
            ? 'No classes found. Set up your grade structure first.'
            : 'No feeding-enrolled students found for this date.'}
        </div>
      )}

      {prePayStudent && (
        <PrePaymentModal
          open
          onClose={() => setPrePayStudent(null)}
          student={prePayStudent}
          onRecorded={refetch}
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
    prePayments: { student: { id: string; studentId: string; firstName: string; lastName: string }; amount: number; daysCovered: number }[];
    paidToday: { student: { id: string; studentId: string; firstName: string; lastName: string } }[];
    totalTransactions: number;
  };

  const fetchRecon = useCallback(
    () => staffApi.get<ReconResponse>(`/school/feeding/reconciliation?date=${date}`).catch(() => null),
    [date],
  );
  const { data: recon, loading } = useApi(fetchRecon);

  return (
    <div>
      <div className="mb-5">
        <input
          type="date" value={date} max={today}
          onChange={e => setDate(e.target.value)}
          className="px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none"
          onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
          onBlur={e => e.currentTarget.style.boxShadow = ''}
        />
      </div>

      {loading && <div className="h-48 bg-slate-100 rounded-2xl animate-pulse" />}

      {!loading && !recon && (
        <div className="bg-white rounded-2xl border border-slate-100 px-6 py-12 text-center text-sm text-slate-400">
          No reconciliation data for this date.
        </div>
      )}

      {!loading && recon && (
        <div className="space-y-4">
          {/* Cash summary */}
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
                <span className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>
                  Total cash collected today
                </span>
                <span className="text-xl font-bold" style={{ color: 'var(--accent)' }}>
                  GHS {Number(recon.cashCollectedToday).toFixed(2)}
                </span>
              </div>
              <p className="text-xs mt-1 text-slate-500">
                Includes pre-payments received and same-day cash.
              </p>
            </div>
          </div>

          {/* Pre-payments detail */}
          {recon.prePayments.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Pre-payments received</p>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Student</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide">Amount</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide">Days covered</th>
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

          {/* Paid today detail */}
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
  const [tab, setTab] = useState<'collection' | 'reconciliation'>('collection');

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Feeding Fees</h1>
          <p className="text-sm text-slate-500 mt-0.5">Daily collection, pre-payments, and reconciliation.</p>
        </div>
      </div>

      <div className="flex gap-1 mb-6 bg-slate-100 p-1 rounded-xl w-fit">
        {([['collection', 'Daily Collection'], ['reconciliation', 'Reconciliation']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn('px-5 py-1.5 rounded-lg text-sm font-medium transition', tab === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'collection'     && <DailyCollectionTab />}
      {tab === 'reconciliation' && <ReconciliationTab />}
    </div>
  );
}
