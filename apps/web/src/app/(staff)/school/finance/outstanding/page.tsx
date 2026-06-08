'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { staffApi } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { cn } from '@/lib/cn';
import { RecordPaymentModal, type PayableInvoice } from '@/components/finance/record-payment-modal';

type OutstandingEntry = {
  invoiceId: string;
  amount: number;
  amountPaid: number;
  balance: number;
  daysOverdue: number | null;
  student: { id: string; firstName: string; lastName: string; studentId: string };
  class: { name: string } | null;
};

type OutstandingResponse = {
  totalOutstanding: number;
  studentsWithBalance: number;
  invoices: OutstandingEntry[];
};

const EMPTY_OUTSTANDING: OutstandingResponse = { totalOutstanding: 0, studentsWithBalance: 0, invoices: [] };

export default function OutstandingPage() {
  const router = useRouter();
  const [termId, setTermId]     = useState('');
  const [classId, setClassId]   = useState('');

  const fetchTerms   = useCallback(() =>
    staffApi.get<any>('/school/academic-years/active').then(y => y?.terms ?? []).catch(() => []),
    [],
  );
  const fetchClasses = useCallback(() => staffApi.get<{ id: string; name: string }[]>('/school/grade-structure/classes'), []);
  const { data: terms }   = useApi(fetchTerms);
  const { data: classes } = useApi(fetchClasses);

  const activeTermId = termId || terms?.find((t: any) => t.isActive)?.id || '';

  const fetchOutstanding = useCallback(() => {
    if (!activeTermId) return Promise.resolve(EMPTY_OUTSTANDING);
    const params = new URLSearchParams({ termId: activeTermId });
    if (classId) params.set('classId', classId);
    return staffApi.get<OutstandingResponse>(`/school/finance/outstanding?${params}`).catch(() => EMPTY_OUTSTANDING);
  }, [activeTermId, classId]);

  const { data, loading, refetch } = useApi(fetchOutstanding, `${activeTermId}|${classId}`);

  const [payInvoice, setPayInvoice] = useState<PayableInvoice | null>(null);

  const entries = data?.invoices ?? [];
  const total   = data?.totalOutstanding ?? 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-bold text-slate-900">Outstanding Balances</h2>
        <select value={activeTermId} onChange={e => setTermId(e.target.value)}
          className="px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none">
          <option value="">Select term…</option>
          {terms?.map((t: any) => <option key={t.id} value={t.id}>{t.name}{t.isActive ? ' ✓' : ''}</option>)}
        </select>
      </div>

      {/* Class tabs */}
      <div className="flex gap-1 mb-5 border-b border-slate-200 overflow-x-auto scrollbar-none">
        {[{ id: '', name: 'All Classes' }, ...(classes ?? [])].map(c => {
          const active = classId === c.id;
          return (
            <button key={c.id || 'all'} onClick={() => setClassId(c.id)}
              className="shrink-0 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap"
              style={active
                ? { color: 'var(--accent)', borderColor: 'var(--accent)' }
                : { color: '#64748b', borderColor: 'transparent' }}>
              {c.name}
            </button>
          );
        })}
      </div>

      {total > 0 && (
        <div className="bg-red-50 border border-red-100 rounded-xl px-5 py-4 mb-5 flex items-center justify-between">
          <p className="text-sm text-red-600">
            <span className="font-semibold">{entries.length}</span> students with outstanding balance
          </p>
          <p className="text-lg font-bold text-red-600">
            GHS {total.toLocaleString('en-GH', { minimumFractionDigits: 2 })} total outstanding
          </p>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Student</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Class</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide">Billed</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide">Paid</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide">Balance</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({length:8}).map((_,i) => (
              <tr key={i} className="border-b border-slate-50">
                <td colSpan={6} className="px-4 py-3"><div className="h-7 bg-slate-100 rounded animate-pulse" /></td>
              </tr>
            ))}
            {!loading && entries.map(entry => (
              <tr key={entry.invoiceId}
                onClick={() => router.push(`/school/finance/invoices/${entry.invoiceId}`)}
                className="border-b border-slate-50 hover:bg-slate-50/40 transition cursor-pointer">
                <td className="px-4 py-3.5">
                  <p className="text-sm font-medium text-slate-800">
                    {entry.student.lastName}, {entry.student.firstName}
                  </p>
                  <p className="text-xs font-mono text-slate-400">{entry.student.studentId}</p>
                </td>
                <td className="px-4 py-3.5 text-sm text-slate-500">{entry.class?.name ?? '—'}</td>
                <td className="px-4 py-3.5 text-right text-sm text-slate-600">{entry.amount.toFixed(2)}</td>
                <td className="px-4 py-3.5 text-right text-sm text-emerald-600">{entry.amountPaid.toFixed(2)}</td>
                <td className="px-4 py-3.5 text-right">
                  <span className="text-sm font-bold text-red-500">GHS {entry.balance.toFixed(2)}</span>
                </td>
                <td className="px-4 py-3.5 text-right">
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      setPayInvoice({
                        id: entry.invoiceId,
                        studentName: `${entry.student.firstName} ${entry.student.lastName}`,
                        balance: entry.balance,
                      });
                    }}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition"
                    style={{ backgroundColor: 'var(--accent)' }}>
                    Record payment
                  </button>
                </td>
              </tr>
            ))}
            {!loading && entries.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-400">
                {activeTermId ? 'No outstanding balances for this term. 🎉' : 'Select a term to view outstanding balances.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <RecordPaymentModal
        invoice={payInvoice}
        onClose={() => setPayInvoice(null)}
        onRecorded={refetch}
      />
    </div>
  );
}
