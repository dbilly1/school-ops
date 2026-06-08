'use client';

import { useState, useCallback } from 'react';
import { staffApi } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { ReceiptModal, type ReceiptData } from '@/components/finance/receipt-modal';

type Transaction = {
  id: string;
  amount: number;
  paymentDate: string;
  method: string | null;
  reference: string | null;
  recordedBy: { firstName: string; lastName: string };
  invoice: {
    id: string;
    amount: number;
    amountPaid: number;
    term: { id: string; name: string };
    student: { id: string; studentId: string; firstName: string; lastName: string };
  };
};

const METHODS = ['Cash', 'Mobile Money', 'Bank Transfer', 'Cheque', 'Other'];

function receiptNo(id: string) {
  return `RCT-${id.slice(0, 8).toUpperCase()}`;
}

function toReceipt(t: Transaction): ReceiptData {
  return {
    receiptNo:    receiptNo(t.id),
    studentName:  `${t.invoice.student.firstName} ${t.invoice.student.lastName}`,
    studentId:    t.invoice.student.studentId,
    description:  `School Fees — ${t.invoice.term.name}`,
    amount:       t.amount,
    paymentDate:  t.paymentDate,
    method:       t.method,
    reference:    t.reference,
    recordedBy:   `${t.recordedBy.firstName} ${t.recordedBy.lastName}`,
    invoiceTotal: t.invoice.amount,
    invoicePaid:  t.invoice.amountPaid,
  };
}

export default function TransactionsPage() {
  const [termFilter, setTermFilter]     = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [search, setSearch]             = useState('');
  const [receipt, setReceipt]           = useState<ReceiptData | null>(null);

  const fetchTerms = useCallback(() =>
    staffApi.get<any>('/school/academic-years/active').then(y => y?.terms ?? []).catch(() => []),
    [],
  );
  const fetchTxns = useCallback(() => {
    const params = new URLSearchParams({ limit: '100' });
    if (termFilter)   params.set('termId', termFilter);
    if (methodFilter) params.set('method', methodFilter);
    return staffApi.get<Transaction[]>(`/school/finance/payments/recent?${params}`).catch(() => []);
  }, [termFilter, methodFilter]);

  const { data: terms }                   = useApi(fetchTerms);
  const { data: txns, loading }           = useApi(fetchTxns, `${termFilter}|${methodFilter}`);

  const filtered = (txns ?? []).filter(t =>
    !search ||
    `${t.invoice.student.firstName} ${t.invoice.student.lastName} ${t.invoice.student.studentId}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  const totalCollected = filtered.reduce((s, t) => s + t.amount, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <h2 className="text-lg font-bold text-slate-900">Recent Transactions</h2>
        <div className="flex items-center gap-3 flex-wrap justify-end">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search student name or ID…"
            className="w-56 px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 outline-none"
            onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
            onBlur={e => e.currentTarget.style.boxShadow = ''}
          />
          <select value={termFilter} onChange={e => setTermFilter(e.target.value)}
            className="px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none">
            <option value="">All terms</option>
            {terms?.map((t: any) => <option key={t.id} value={t.id}>{t.name}{t.isActive ? ' ✓' : ''}</option>)}
          </select>
          <select value={methodFilter} onChange={e => setMethodFilter(e.target.value)}
            className="px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none">
            <option value="">All methods</option>
            {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      {filtered.length > 0 && (
        <div className="bg-white border border-slate-100 shadow-sm rounded-xl px-5 py-4 mb-5 flex items-center justify-between">
          <p className="text-sm text-slate-500">
            <span className="font-semibold text-slate-800">{filtered.length}</span> payment{filtered.length !== 1 ? 's' : ''}
          </p>
          <p className="text-lg font-bold text-emerald-600">
            GHS {totalCollected.toLocaleString('en-GH', { minimumFractionDigits: 2 })} collected
          </p>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Date</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Student</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Term</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide">Amount</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Method</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Recorded by</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 8 }).map((_, i) => (
              <tr key={i} className="border-b border-slate-50">
                <td colSpan={7} className="px-4 py-3"><div className="h-7 bg-slate-100 rounded animate-pulse" /></td>
              </tr>
            ))}
            {!loading && filtered.map(t => (
              <tr key={t.id}
                onClick={() => setReceipt(toReceipt(t))}
                className="border-b border-slate-50 hover:bg-slate-50/40 transition cursor-pointer">
                <td className="px-4 py-3.5 text-sm text-slate-600 whitespace-nowrap">
                  {new Date(t.paymentDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </td>
                <td className="px-4 py-3.5">
                  <p className="text-sm font-medium text-slate-800">
                    {t.invoice.student.lastName}, {t.invoice.student.firstName}
                  </p>
                  <p className="text-xs font-mono text-slate-400">{t.invoice.student.studentId}</p>
                </td>
                <td className="px-4 py-3.5 text-sm text-slate-500">{t.invoice.term.name}</td>
                <td className="px-4 py-3.5 text-right text-sm font-semibold text-emerald-600 whitespace-nowrap">
                  GHS {t.amount.toFixed(2)}
                </td>
                <td className="px-4 py-3.5 text-sm text-slate-500">{t.method ?? '—'}</td>
                <td className="px-4 py-3.5 text-xs text-slate-500">
                  {t.recordedBy.firstName} {t.recordedBy.lastName}
                </td>
                <td className="px-4 py-3.5 text-right">
                  <button onClick={e => { e.stopPropagation(); setReceipt(toReceipt(t)); }}
                    className="text-xs font-medium transition" style={{ color: 'var(--accent)' }}>
                    Receipt
                  </button>
                </td>
              </tr>
            ))}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-400">
                {search || termFilter || methodFilter
                  ? 'No transactions match your filters.'
                  : 'No payments recorded yet. Record a payment from an invoice to get started.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
}
