'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { staffApi, type ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { SaveButton, Alert } from '@/components/ui/settings-card';

type Invoice = {
  id: string;
  amount: number;
  amountPaid: number;
  status: 'UNPAID' | 'PARTIAL' | 'PAID';
  dueDate: string | null;
  student: { id: string; firstName: string; lastName: string; studentId: string };
  term: { id: string; name: string };
};

const STATUS_COLORS = {
  PAID:    { text: '#22c55e', bg: '#f0fdf4' },
  PARTIAL: { text: '#f59e0b', bg: '#fffbeb' },
  UNPAID:  { text: '#ef4444', bg: '#fef2f2' },
};

export default function InvoicesPage() {
  const router = useRouter();
  const [termFilter, setTermFilter]   = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [generating, setGenerating]   = useState(false);
  const [alert, setAlert]             = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  const fetchTerms  = useCallback(() =>
    staffApi.get<any>('/school/academic-years/active').then(y => y?.terms ?? []).catch(() => []),
    [],
  );
  const fetchClasses = useCallback(() => staffApi.get<{ id: string; name: string }[]>('/school/grade-structure/classes'), []);
  const fetchInvoices = useCallback(() => {
    const params = new URLSearchParams();
    if (termFilter)  params.set('termId',  termFilter);
    if (classFilter) params.set('classId', classFilter);
    return staffApi.get<Invoice[]>(`/school/finance/invoices?${params}`);
  }, [termFilter, classFilter]);

  const { data: terms }                       = useApi(fetchTerms);
  const { data: classes }                     = useApi(fetchClasses);
  const { data: invoices, loading, refetch }  = useApi(fetchInvoices);

  const activeTermId = termFilter || terms?.find((t: any) => t.isActive)?.id || '';

  async function generateInvoices() {
    if (!activeTermId) { setAlert({ type: 'error', message: 'Select a term first.' }); return; }
    setAlert(null); setGenerating(true);
    try {
      const result = await staffApi.post<{ count: number }>(`/school/finance/invoices/generate/${activeTermId}`);
      setAlert({ type: 'success', message: `${result.count} invoice${result.count !== 1 ? 's' : ''} generated.` });
      refetch();
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Failed to generate invoices.' });
    } finally {
      setGenerating(false);
    }
  }

  const totals = invoices?.reduce((acc, inv) => ({
    total: acc.total + inv.amount,
    paid:  acc.paid  + inv.amountPaid,
    count: acc.count + 1,
  }), { total: 0, paid: 0, count: 0 });

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-bold text-slate-900">Invoices</h2>
        <div className="flex items-center gap-3">
          <select value={termFilter} onChange={e => setTermFilter(e.target.value)}
            className="px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none">
            <option value="">All terms</option>
            {terms?.map((t: any) => <option key={t.id} value={t.id}>{t.name}{t.isActive ? ' ✓' : ''}</option>)}
          </select>
          <select value={classFilter} onChange={e => setClassFilter(e.target.value)}
            className="px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none">
            <option value="">All classes</option>
            {classes?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button onClick={generateInvoices} disabled={generating}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition disabled:opacity-50">
            {generating ? 'Generating…' : '↺ Generate invoices'}
          </button>
        </div>
      </div>

      {alert && <div className="mb-4"><Alert type={alert.type} message={alert.message} /></div>}

      {/* Summary */}
      {totals && totals.count > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-5">
          {[
            { label: 'Total billed', value: `GHS ${totals.total.toLocaleString('en-GH', { minimumFractionDigits: 2 })}`, color: 'text-slate-800' },
            { label: 'Total collected', value: `GHS ${totals.paid.toLocaleString('en-GH', { minimumFractionDigits: 2 })}`, color: 'text-emerald-600' },
            { label: 'Outstanding', value: `GHS ${(totals.total - totals.paid).toLocaleString('en-GH', { minimumFractionDigits: 2 })}`, color: 'text-red-500' },
          ].map(chip => (
            <div key={chip.label} className="bg-white rounded-xl border border-slate-100 shadow-sm px-5 py-4">
              <p className="text-xs text-slate-400 mb-1">{chip.label}</p>
              <p className={`text-xl font-bold ${chip.color}`}>{chip.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Student</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Term</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide">Billed</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide">Paid</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide">Balance</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({length:8}).map((_,i) => (
              <tr key={i} className="border-b border-slate-50">
                <td colSpan={7} className="px-4 py-3"><div className="h-7 bg-slate-100 rounded animate-pulse" /></td>
              </tr>
            ))}
            {!loading && invoices?.map(inv => {
              const balance = inv.amount - inv.amountPaid;
              const sc      = STATUS_COLORS[inv.status];
              return (
                <tr key={inv.id} className="border-b border-slate-50 hover:bg-slate-50/40 transition">
                  <td className="px-4 py-3.5">
                    <p className="text-sm font-medium text-slate-800">
                      {inv.student.lastName}, {inv.student.firstName}
                    </p>
                    <p className="text-xs font-mono text-slate-400">{inv.student.studentId}</p>
                  </td>
                  <td className="px-4 py-3.5"><span className="text-xs text-slate-500">{inv.term.name}</span></td>
                  <td className="px-4 py-3.5 text-right">
                    <span className="text-sm text-slate-700">{inv.amount.toFixed(2)}</span>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <span className="text-sm text-emerald-600">{inv.amountPaid.toFixed(2)}</span>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <span className={`text-sm font-medium ${balance > 0 ? 'text-red-500' : 'text-slate-400'}`}>
                      {balance.toFixed(2)}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                      style={{ color: sc.text, backgroundColor: sc.bg }}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <button onClick={() => router.push(`/school/finance/invoices/${inv.id}`)}
                      className="text-xs font-medium transition" style={{ color: 'var(--accent)' }}>
                      Manage →
                    </button>
                  </td>
                </tr>
              );
            })}
            {!loading && (!invoices || invoices.length === 0) && (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-400">
                No invoices. Generate invoices for a term to get started.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
