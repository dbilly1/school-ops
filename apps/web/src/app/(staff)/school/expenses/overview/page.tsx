'use client';

import { useState, useCallback, useEffect } from 'react';
import { staffApi } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import type { TermOption } from '@/components/finance/expense-form-modal';

type Summary = {
  mode: 'SEPARATED' | 'UNIFIED';
  term: { id: string; name: string };
  income: { fees: number; feeding: number; transport: number; total: number };
  expenses: { total: number; byCategory: { categoryId: string; name: string; spent: number; budget: number }[] };
  net: number;
};

function fmt(n: number) {
  return n.toLocaleString('en-GH', { minimumFractionDigits: 2 });
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: 'income' | 'expense' | 'net' }) {
  const color = tone === 'income' ? 'text-emerald-600' : tone === 'expense' ? 'text-red-500' : value >= 0 ? 'text-slate-900' : 'text-red-500';
  return (
    <div className="bg-white border border-slate-100 shadow-sm rounded-2xl px-5 py-4">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>GHS {fmt(value)}</p>
    </div>
  );
}

export default function ExpensesOverviewPage() {
  const [termId, setTermId] = useState('');

  const fetchTerms = useCallback(() =>
    staffApi.get<any>('/school/academic-years/active').then(y => (y?.terms ?? []) as TermOption[]).catch(() => []),
    [],
  );
  const { data: terms } = useApi(fetchTerms);

  // Default to the active term once terms load.
  useEffect(() => {
    if (!termId && terms?.length) setTermId(terms.find(t => t.isActive)?.id ?? terms[0].id);
  }, [terms, termId]);

  const fetchSummary = useCallback(() =>
    termId ? staffApi.get<Summary>(`/school/finance/summary?termId=${termId}`) : Promise.resolve(null),
    [termId],
  );
  const { data: summary, loading } = useApi(fetchSummary, termId);

  return (
    <div>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <h2 className="text-lg font-bold text-slate-900">Overview</h2>
        <select value={termId} onChange={e => setTermId(e.target.value)}
          className="px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none">
          {terms?.map(t => <option key={t.id} value={t.id}>{t.name}{t.isActive ? ' ✓' : ''}</option>)}
        </select>
      </div>

      {loading && !summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 bg-slate-100 rounded-2xl animate-pulse" />)}
        </div>
      )}

      {summary && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-3">
            <StatCard label="Income collected" value={summary.income.total} tone="income" />
            <StatCard label="Expenses" value={summary.expenses.total} tone="expense" />
            <StatCard label="Net" value={summary.net} tone="net" />
          </div>

          {/* Income breakdown — only meaningful when streams are pooled (Unified mode).
              In Separated mode feeding/transport income is reported on their own pages
              (always 0 here), so the breakdown is redundant. */}
          {summary.mode === 'UNIFIED' && (
            <div className="bg-white border border-slate-100 shadow-sm rounded-2xl px-5 py-4 mb-6">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Income breakdown</p>
              <div className="flex flex-wrap gap-x-10 gap-y-2 text-sm">
                <div><span className="text-slate-500">School fees</span> <span className="font-semibold text-slate-800 ml-2">GHS {fmt(summary.income.fees)}</span></div>
                <div><span className="text-slate-500">Feeding</span> <span className="font-semibold text-slate-800 ml-2">GHS {fmt(summary.income.feeding)}</span></div>
                <div><span className="text-slate-500">Transport</span> <span className="font-semibold text-slate-800 ml-2">GHS {fmt(summary.income.transport)}</span></div>
              </div>
            </div>
          )}

          {/* Budget vs spent */}
          <div className="bg-white border border-slate-100 shadow-sm rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <p className="text-sm font-bold text-slate-900">Spending by category</p>
              <p className="text-xs text-slate-400 mt-0.5">Spent vs budget for {summary.term.name}</p>
            </div>
            <div className="px-5 py-4 space-y-4">
              {summary.expenses.byCategory.length === 0 && (
                <p className="text-sm text-slate-400 py-4 text-center">No expenses or budgets set for this term yet.</p>
              )}
              {summary.expenses.byCategory.map(c => {
                const pct = c.budget > 0 ? Math.min(100, (c.spent / c.budget) * 100) : 0;
                const over = c.budget > 0 && c.spent > c.budget;
                return (
                  <div key={c.categoryId}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="font-medium text-slate-700">{c.name}</span>
                      <span className="text-slate-500">
                        GHS {fmt(c.spent)}
                        {c.budget > 0 && <span className="text-slate-400"> / {fmt(c.budget)}</span>}
                      </span>
                    </div>
                    {c.budget > 0 ? (
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: over ? '#ef4444' : 'var(--accent)' }} />
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-400">No budget set</p>
                    )}
                    {over && <p className="text-[11px] text-red-500 mt-0.5">Over budget by GHS {fmt(c.spent - c.budget)}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
