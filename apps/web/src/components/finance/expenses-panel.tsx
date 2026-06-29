'use client';

import { useState, useCallback, useMemo } from 'react';
import { staffApi } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { PermissionGate } from '@/components/guards/permission-gate';
import { ExpenseFormModal, type EditableExpense, type ExpenseCategory, type TermOption } from '@/components/finance/expense-form-modal';
import { ManageCategoriesModal } from '@/components/finance/manage-categories-modal';
import { BudgetEditorModal } from '@/components/finance/budget-editor-modal';

type CostCenter = 'GENERAL' | 'FEEDING' | 'TRANSPORT';

type Expense = {
  id: string;
  amount: number;
  expenseDate: string;
  payee: string | null;
  method: string | null;
  reference: string | null;
  notes: string | null;
  costCenter: CostCenter;
  categoryId: string;
  category: { id: string; name: string };
  termId: string;
  term: { id: string; name: string };
  recordedBy: { firstName: string; lastName: string };
};

type StreamSummary = { income: number; expense: number; net: number };

const CENTER_LABEL: Record<CostCenter, string> = { GENERAL: 'General', FEEDING: 'Feeding', TRANSPORT: 'Transport' };

function fmt(n: number) {
  return n.toLocaleString('en-GH', { minimumFractionDigits: 2 });
}

/**
 * The shared expenses surface used by the General page and the Transport /
 * Feeding expense surfaces. Each instance is pinned to one cost center via its
 * `endpointBase`; the General page may additionally show pooled rows from other
 * streams (UNIFIED mode), which are rendered read-only with a stream tag.
 */
export function ExpensesPanel({
  endpointBase,
  ownCenter,
  perm,
  showBudgets = false,
  summaryEndpoint,
  streamLabel,
}: {
  endpointBase: string;                       // '/school/finance' | '/school/transport' | '/school/feeding'
  ownCenter: CostCenter;                       // rows of other centers are read-only here
  perm: { featureKey: string; subFeatureKey?: string };
  showBudgets?: boolean;                        // General only
  summaryEndpoint?: string;                     // stream net card (Feeding / Transport)
  streamLabel?: string;                         // e.g. 'Feeding'
}) {
  const [termFilter, setTermFilter]         = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [formOpen, setFormOpen]             = useState(false);
  const [editing, setEditing]               = useState<EditableExpense | null>(null);
  const [catsOpen, setCatsOpen]             = useState(false);
  const [budgetOpen, setBudgetOpen]         = useState(false);

  const fetchTerms = useCallback(() =>
    staffApi.get<any>('/school/academic-years/active').then(y => (y?.terms ?? []) as TermOption[]).catch(() => []),
    [],
  );
  const fetchCategories = useCallback(() =>
    staffApi.get<ExpenseCategory[]>(`${endpointBase}/expense-categories`).catch(() => []),
    [endpointBase],
  );
  const fetchExpenses = useCallback(() => {
    const params = new URLSearchParams();
    if (termFilter)     params.set('termId', termFilter);
    if (categoryFilter) params.set('categoryId', categoryFilter);
    const qs = params.toString();
    return staffApi.get<Expense[]>(`${endpointBase}/expenses${qs ? `?${qs}` : ''}`).catch(() => []);
  }, [endpointBase, termFilter, categoryFilter]);

  const { data: terms }                            = useApi(fetchTerms);
  const { data: categories, refetch: refetchCats } = useApi(fetchCategories);
  const { data: expenses, loading, refetch: refetchExpenses } = useApi(fetchExpenses, `${endpointBase}|${termFilter}|${categoryFilter}`);

  const activeTermId = useMemo(() => terms?.find(t => t.isActive)?.id ?? terms?.[0]?.id ?? '', [terms]);
  const summaryTermId = termFilter || activeTermId;

  const fetchSummary = useCallback(() =>
    summaryEndpoint && summaryTermId
      ? staffApi.get<StreamSummary>(`${summaryEndpoint}?termId=${summaryTermId}`).catch(() => null)
      : Promise.resolve(null),
    [summaryEndpoint, summaryTermId],
  );
  const { data: summary } = useApi(fetchSummary, `${summaryEndpoint ?? ''}|${summaryTermId}`);

  const total = (expenses ?? []).reduce((s, e) => s + e.amount, 0);
  const hasForeign = (expenses ?? []).some(e => e.costCenter !== ownCenter);

  function openCreate() { setEditing(null); setFormOpen(true); }
  function openEdit(e: Expense) {
    setEditing({
      id: e.id, categoryId: e.categoryId, termId: e.termId, amount: e.amount,
      expenseDate: e.expenseDate, payee: e.payee, method: e.method, reference: e.reference, notes: e.notes,
    });
    setFormOpen(true);
  }
  async function del(e: Expense) {
    if (!confirm(`Delete this ${e.category.name} expense of GHS ${fmt(e.amount)}?`)) return;
    await staffApi.delete(`${endpointBase}/expenses/${e.id}`).catch(() => {});
    refetchExpenses();
  }

  const activeTermName = terms?.find(t => t.id === summaryTermId)?.name ?? 'this term';

  return (
    <div>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <select value={termFilter} onChange={e => setTermFilter(e.target.value)}
            className="px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none">
            <option value="">All terms</option>
            {terms?.map(t => <option key={t.id} value={t.id}>{t.name}{t.isActive ? ' ✓' : ''}</option>)}
          </select>
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
            className="px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none">
            <option value="">All categories</option>
            {categories?.filter(c => !c.isArchived).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <PermissionGate featureKey={perm.featureKey} subFeatureKey={perm.subFeatureKey} action="EDIT">
            <button onClick={() => setCatsOpen(true)}
              className="px-3.5 py-2 text-sm font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition">
              Categories
            </button>
            {showBudgets && (
              <button onClick={() => setBudgetOpen(true)}
                className="px-3.5 py-2 text-sm font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition">
                Budgets
              </button>
            )}
          </PermissionGate>
          <PermissionGate featureKey={perm.featureKey} subFeatureKey={perm.subFeatureKey} action="CREATE">
            <button onClick={openCreate}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition"
              style={{ backgroundColor: 'var(--accent)' }}>
              + Record expense
            </button>
          </PermissionGate>
        </div>
      </div>

      {/* Stream net card (Feeding / Transport) */}
      {summaryEndpoint && summary && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label: `${streamLabel ?? ''} collected`, value: summary.income, color: '#22c55e' },
            { label: `${streamLabel ?? ''} spent`,     value: summary.expense, color: '#ef4444' },
            { label: 'Net this term',                  value: summary.net,     color: summary.net >= 0 ? 'var(--accent)' : '#b45309' },
          ].map(c => (
            <div key={c.label} className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3">
              <p className="text-xs text-slate-400">{c.label.trim()}</p>
              <p className="text-lg font-bold" style={{ color: c.color }}>GHS {fmt(c.value)}</p>
            </div>
          ))}
        </div>
      )}

      {!summaryEndpoint && (expenses?.length ?? 0) > 0 && (
        <div className="bg-white border border-slate-100 shadow-sm rounded-xl px-5 py-4 mb-5 flex items-center justify-between">
          <p className="text-sm text-slate-500">
            <span className="font-semibold text-slate-800">{expenses!.length}</span> expense{expenses!.length !== 1 ? 's' : ''}
          </p>
          <p className="text-lg font-bold text-red-500">GHS {fmt(total)} spent</p>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
        <table className="w-full min-w-[820px]">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              {['Date', 'Category', 'Payee', 'Term', 'Method', 'Recorded by'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">{h}</th>
              ))}
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide">Amount</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 8 }).map((_, i) => (
              <tr key={i} className="border-b border-slate-50">
                <td colSpan={8} className="px-4 py-3"><div className="h-7 bg-slate-100 rounded animate-pulse" /></td>
              </tr>
            ))}
            {!loading && (expenses ?? []).map(e => {
              const foreign = e.costCenter !== ownCenter;
              return (
                <tr key={e.id} className="border-b border-slate-50 hover:bg-slate-50/40 transition">
                  <td className="px-4 py-3.5 text-sm text-slate-600 whitespace-nowrap">
                    {new Date(e.expenseDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3.5 text-sm font-medium text-slate-800">
                    {e.category.name}
                    {foreign && (
                      <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                        {CENTER_LABEL[e.costCenter]}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-sm text-slate-500">{e.payee ?? '—'}</td>
                  <td className="px-4 py-3.5 text-sm text-slate-500">{e.term.name}</td>
                  <td className="px-4 py-3.5 text-sm text-slate-500">{e.method ?? '—'}</td>
                  <td className="px-4 py-3.5 text-xs text-slate-500">{e.recordedBy.firstName} {e.recordedBy.lastName}</td>
                  <td className="px-4 py-3.5 text-right text-sm font-semibold text-red-500 whitespace-nowrap">GHS {fmt(e.amount)}</td>
                  <td className="px-4 py-3.5 text-right whitespace-nowrap">
                    {/* Foreign-stream rows (General + UNIFIED) are read-only — edit them on their own page. */}
                    {!foreign && (
                      <>
                        <PermissionGate featureKey={perm.featureKey} subFeatureKey={perm.subFeatureKey} action="EDIT">
                          <button onClick={() => openEdit(e)} className="text-xs font-medium px-1.5" style={{ color: 'var(--accent)' }}>Edit</button>
                        </PermissionGate>
                        <PermissionGate featureKey={perm.featureKey} subFeatureKey={perm.subFeatureKey} action="DELETE">
                          <button onClick={() => del(e)} className="text-xs font-medium text-red-500 hover:text-red-700 px-1.5">Delete</button>
                        </PermissionGate>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            {!loading && (expenses?.length ?? 0) === 0 && (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-slate-400">
                {termFilter || categoryFilter ? 'No expenses match your filters.' : 'No expenses recorded yet. Record your first expense to get started.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {hasForeign && (
        <p className="mt-3 text-xs text-slate-400">
          Tagged rows belong to another stream and are shown here because expenses are pooled (Unified mode). Edit them on their own page.
        </p>
      )}

      <ExpenseFormModal
        open={formOpen}
        expense={editing}
        categories={categories ?? []}
        terms={terms ?? []}
        activeTermId={activeTermId}
        endpointBase={endpointBase}
        onClose={() => setFormOpen(false)}
        onSaved={refetchExpenses}
      />
      <ManageCategoriesModal
        open={catsOpen}
        categories={categories ?? []}
        endpointBase={endpointBase}
        onClose={() => setCatsOpen(false)}
        onChanged={refetchCats}
      />
      {showBudgets && (
        <BudgetEditorModal
          open={budgetOpen}
          categories={categories ?? []}
          termId={summaryTermId}
          termName={activeTermName}
          onClose={() => setBudgetOpen(false)}
          onSaved={() => {}}
        />
      )}
    </div>
  );
}
