'use client';

import { useState, useCallback, useEffect, useMemo, Fragment } from 'react';
import { staffApi, type ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { InvoicePreviewModal, type InvoicePreviewData } from '@/components/finance/invoice-preview-modal';
import { useStaffAuth } from '@/contexts/staff-auth';

// ── Types ─────────────────────────────────────────────────────────────────────

type GradeLevel      = { id: string; name: string; sequence: number };
type StudentCategory = { id: string; name: string };
type BillingFrequency = 'PER_TERM' | 'PER_YEAR' | 'ONE_TIME';
type FeeComponent    = { id: string; name: string; sequence: number; isArchived: boolean; billingFrequency: BillingFrequency };
type FeeItem         = {
  feeComponentId: string;
  defaultAmount: number;
  overrides: { gradeLevelId: string; amount: number }[];
};

// Editable row state, keyed by componentId.
type Row = { default: string; overrides: Record<string, string>; expanded: boolean };

const ghs = (n: number) => `GHS ${n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (s: string | undefined) => { const n = parseFloat(s ?? ''); return isNaN(n) ? 0 : n; };

const FREQ_OPTIONS: { value: BillingFrequency; label: string }[] = [
  { value: 'PER_TERM', label: 'Every term' },
  { value: 'PER_YEAR', label: 'Once a year' },
  { value: 'ONE_TIME', label: 'One-time' },
];
const FREQ_LABEL: Record<BillingFrequency, string> = {
  PER_TERM: 'Every term', PER_YEAR: 'Once a year', ONE_TIME: 'One-time',
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FeeSetupPage() {
  const { user } = useStaffAuth();
  const issuedBy = user ? `${user.firstName} ${user.lastName}`.trim() : null;

  const fetchGrades = useCallback(() => staffApi.get<GradeLevel[]>('/school/grade-structure/grade-levels'), []);
  const fetchCats   = useCallback(() => staffApi.get<StudentCategory[]>('/school/student-categories'), []);
  const fetchComps  = useCallback(() => staffApi.get<FeeComponent[]>('/school/finance/fee-components'), []);

  const { data: grades }                            = useApi(fetchGrades);
  const { data: categories }                        = useApi(fetchCats);
  const { data: components, refetch: refetchComps } = useApi(fetchComps);

  const sortedGrades = useMemo(() => (grades ?? []).slice().sort((a, b) => a.sequence - b.sequence), [grades]);
  const cats         = categories ?? [];
  const comps        = useMemo(() => (components ?? []).slice().sort((a, b) => a.sequence - b.sequence), [components]);

  // ── Selection ──────────────────────────────────────────────────────────────
  const [categoryId, setCategoryId] = useState('');
  useEffect(() => { if (!categoryId && cats.length) setCategoryId(cats[0].id); }, [cats, categoryId]);

  // ── Fee items for the chosen category (term-agnostic) ────────────────────────
  const fetchItems = useCallback(() => {
    if (!categoryId) return Promise.resolve([] as FeeItem[]);
    return staffApi.get<FeeItem[]>(`/school/finance/fee-items?studentCategoryId=${categoryId}`);
  }, [categoryId]);
  const { data: items, loading: loadingItems, refetch: refetchItems } = useApi(fetchItems, categoryId);

  // ── Editable rows ────────────────────────────────────────────────────────────
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const map: Record<string, Row> = {};
    for (const c of comps) {
      const item = items?.find(i => i.feeComponentId === c.id);
      const overrides: Record<string, string> = {};
      for (const o of item?.overrides ?? []) overrides[o.gradeLevelId] = String(o.amount);
      map[c.id] = {
        default: item ? String(item.defaultAmount) : '',
        overrides,
        expanded: (item?.overrides.length ?? 0) > 0,
      };
    }
    setRows(map);
    setDirty(false);
  }, [comps, items]);

  function setDefault(compId: string, value: string) {
    setRows(p => ({ ...p, [compId]: { ...p[compId], default: value } }));
    setDirty(true);
  }
  function setOverride(compId: string, gradeId: string, value: string) {
    setRows(p => ({ ...p, [compId]: { ...p[compId], overrides: { ...p[compId].overrides, [gradeId]: value } } }));
    setDirty(true);
  }
  function toggleExpand(compId: string) {
    setRows(p => ({ ...p, [compId]: { ...p[compId], expanded: !p[compId].expanded } }));
  }

  // Effective amount for a component at a grade (override if set, else default).
  function effective(compId: string, gradeId: string): number {
    const row = rows[compId];
    if (!row) return 0;
    const ov = row.overrides[gradeId];
    if (ov !== undefined && ov !== '' && num(ov) > 0) return num(ov);
    return num(row.default);
  }
  function gradeTotal(gradeId: string): number {
    return comps.reduce((sum, c) => sum + effective(c.id, gradeId), 0);
  }

  // ── Invoice preview ──────────────────────────────────────────────────────────
  const [previewGradeId, setPreviewGradeId] = useState<string | null>(null);
  const previewData: InvoicePreviewData | null = useMemo(() => {
    if (!previewGradeId) return null;
    const grade = sortedGrades.find(g => g.id === previewGradeId);
    if (!grade) return null;
    const lines = comps
      .map(c => ({
        name: c.name,
        amount: effective(c.id, previewGradeId),
        tag: c.billingFrequency !== 'PER_TERM' ? FREQ_LABEL[c.billingFrequency] : undefined,
      }))
      .filter(l => l.amount > 0);
    return {
      className: grade.name,
      lines,
      issuedBy,
    };
    // effective() reads `rows`, so recompute when rows change too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewGradeId, sortedGrades, comps, categoryId, rows, issuedBy]);

  // ── Save ─────────────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]       = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setSaving(true); setMsg(null);
    try {
      const payload = comps
        .map(c => {
          const row = rows[c.id];
          const overrides = sortedGrades
            .map(g => ({ gradeLevelId: g.id, amount: num(row?.overrides[g.id]) }))
            .filter(o => o.amount > 0);
          return { feeComponentId: c.id, defaultAmount: num(row?.default), overrides };
        })
        .filter(i => i.defaultAmount > 0 || i.overrides.length > 0);

      const res = await staffApi.put<{ saved: number }>('/school/finance/fee-items', {
        studentCategoryId: categoryId, items: payload,
      });
      setMsg({ ok: true, text: `Saved ${res.saved} item${res.saved !== 1 ? 's' : ''}.` });
      setDirty(false);
      refetchItems();
    } catch (err) {
      setMsg({ ok: false, text: (err as ApiError).message ?? 'Failed to save.' });
    } finally {
      setSaving(false);
    }
  }

  // ── Component catalog management ────────────────────────────────────────────
  const [newComp, setNewComp]     = useState('');
  const [compBusy, setCompBusy]   = useState(false);
  const [compErr, setCompErr]     = useState<string | null>(null);

  async function addComponent() {
    const name = newComp.trim();
    if (!name) return;
    setCompBusy(true); setCompErr(null);
    try {
      await staffApi.post('/school/finance/fee-components', { name });
      setNewComp('');
      refetchComps();
    } catch (err) {
      setCompErr((err as ApiError).message ?? 'Failed to add component.');
    } finally {
      setCompBusy(false);
    }
  }
  async function deleteComponent(id: string) {
    setCompErr(null);
    try {
      await staffApi.delete(`/school/finance/fee-components/${id}`);
      refetchComps();
    } catch (err) {
      setCompErr((err as ApiError).message ?? 'Failed to delete component.');
    }
  }
  async function setFrequency(id: string, billingFrequency: BillingFrequency) {
    setCompErr(null);
    try {
      await staffApi.patch(`/school/finance/fee-components/${id}`, { billingFrequency });
      refetchComps();
    } catch (err) {
      setCompErr((err as ApiError).message ?? 'Failed to update component.');
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const loading = !!categoryId && loadingItems;
  const noCats  = cats.length === 0;
  const noComps = comps.length === 0;

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Fee Setup</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Build each fee from its components. Set a price once; override only the classes that differ.
            These are the terminal fees — billed each term until you change them.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-4 mt-0.5">
          {msg && <span className={`text-sm ${msg.ok ? 'text-green-600' : 'text-red-500'}`}>{msg.text}</span>}
          <button
            onClick={save}
            disabled={saving || !dirty || !categoryId}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition disabled:opacity-40"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
          </button>
        </div>
      </div>

      {/* Setup warning */}
      {noCats && (
        <div className="px-4 py-3 mb-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
          No student categories yet. Go to <strong>Settings → Student Categories</strong> to add them
          (e.g. Day, Boarding) — each category gets its own billable items.
        </div>
      )}

      {!noCats && (
        <>
          {/* Category tabs */}
          <div className="flex items-center gap-1 mb-5 border-b border-slate-200 overflow-x-auto scrollbar-slim">
            {cats.map(c => {
              const active = c.id === categoryId;
              return (
                <button key={c.id} onClick={() => setCategoryId(c.id)}
                  className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition ${
                    active ? '' : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                  style={active ? { color: 'var(--accent)', borderColor: 'var(--accent)' } : undefined}>
                  {c.name}
                </button>
              );
            })}
          </div>

          {/* Component catalog — shown upfront */}
          <div className="mb-5 p-4 bg-slate-50 rounded-xl border border-slate-100">
            <p className="text-sm font-medium text-slate-600 mb-1">Fee components</p>
            <p className="text-xs text-slate-400 mb-3">
              Shared across all categories. Add everything your school bills for; then price them per category
              below. Leave a component blank for a category that doesn’t pay it. Set how often each one is billed
              in the table below.
            </p>
            {compErr && <p className="mb-2 text-sm text-red-500">{compErr}</p>}
            <div className="flex flex-wrap gap-2 mb-3">
              {comps.map(c => (
                <span key={c.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-white border border-slate-200 text-slate-700">
                  {c.name}
                  {c.billingFrequency !== 'PER_TERM' && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700">
                      {FREQ_LABEL[c.billingFrequency]}
                    </span>
                  )}
                  <button onClick={() => deleteComponent(c.id)} className="text-slate-300 hover:text-red-500 transition text-base leading-none">×</button>
                </span>
              ))}
              {noComps && <p className="text-sm text-slate-400 italic">No components yet. Add some below.</p>}
            </div>
            <div className="flex gap-2">
              <input value={newComp} onChange={e => setNewComp(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addComponent()}
                placeholder="e.g. Tuition, PTA, Exams, Admission…"
                className="flex-1 max-w-xs px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg outline-none" />
              <button onClick={addComponent} disabled={compBusy || !newComp.trim()}
                className="px-3 py-2 rounded-lg text-sm font-medium text-white transition disabled:opacity-40"
                style={{ backgroundColor: 'var(--accent)' }}>
                {compBusy ? 'Adding…' : 'Add'}
              </button>
            </div>
          </div>

          {/* Empty: no components */}
          {noComps ? (
            <div className="px-4 py-8 bg-white rounded-2xl border border-slate-200 text-center">
              <p className="text-sm text-slate-500">No fee components yet.</p>
              <p className="text-xs text-slate-400 mt-1">Add Tuition, PTA, Exams, Admission, etc. in the panel above.</p>
            </div>
          ) : loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map(i => <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />)}
            </div>
          ) : (
            <>
              {/* Item editor */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Component</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide w-36">Billed</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide w-40">Price (all classes)</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide w-36" />
                    </tr>
                  </thead>
                  <tbody>
                    {comps.map((c, ci) => {
                      const row = rows[c.id] ?? { default: '', overrides: {}, expanded: false };
                      const overrideCount = sortedGrades.filter(g => num(row.overrides[g.id]) > 0).length;
                      return (
                        <Fragment key={c.id}>
                          <tr style={{ backgroundColor: ci % 2 === 0 ? '#fff' : '#f9fafb' }}>
                            <td className="px-4 py-2.5 font-medium text-slate-700">{c.name}</td>
                            <td className="px-4 py-2">
                              <select value={c.billingFrequency}
                                onChange={e => setFrequency(c.id, e.target.value as BillingFrequency)}
                                className="px-2 py-1 text-xs bg-white border border-slate-200 rounded-lg outline-none text-slate-600">
                                {FREQ_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                              </select>
                            </td>
                            <td className="px-4 py-2">
                              <div className="flex items-center justify-end gap-1.5">
                                <span className="text-xs text-slate-400">GHS</span>
                                <input type="number" min="0" step="0.01" value={row.default}
                                  onChange={e => setDefault(c.id, e.target.value)} placeholder="0.00"
                                  className="w-24 px-2 py-1.5 text-right text-sm border border-slate-200 rounded-lg outline-none focus:border-transparent"
                                  onFocus={e => (e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)')}
                                  onBlur={e => (e.currentTarget.style.boxShadow = '')} />
                              </div>
                            </td>
                            <td className="px-4 py-2 text-right">
                              <button onClick={() => toggleExpand(c.id)}
                                className="text-xs font-medium transition" style={{ color: 'var(--accent)' }}>
                                {row.expanded ? 'Hide classes' : overrideCount > 0 ? `Vary by class (${overrideCount})` : 'Vary by class'}
                              </button>
                            </td>
                          </tr>
                          {row.expanded && (
                            <tr style={{ backgroundColor: ci % 2 === 0 ? '#fff' : '#f9fafb' }}>
                              <td colSpan={4} className="px-4 pb-3 pt-0">
                                <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                                  <p className="text-xs text-slate-400 mb-2">
                                    Leave a class blank to use the price above ({ghs(num(row.default))}). Fill only the classes that differ.
                                  </p>
                                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                                    {sortedGrades.map(g => (
                                      <div key={g.id} className="flex items-center gap-1.5">
                                        <label className="text-xs text-slate-500 w-20 truncate" title={g.name}>{g.name}</label>
                                        <input type="number" min="0" step="0.01" value={row.overrides[g.id] ?? ''}
                                          onChange={e => setOverride(c.id, g.id, e.target.value)}
                                          placeholder={row.default || '0.00'}
                                          className="w-20 px-2 py-1 text-right text-sm bg-white border border-slate-200 rounded-lg outline-none" />
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Totals preview */}
              <div className="mt-5 bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                    Total per class — {cats.find(c => c.id === categoryId)?.name}
                  </h3>
                  <span className="text-[11px] text-slate-400">Click a class to preview its invoice</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <tbody>
                      {sortedGrades.map((g, gi) => {
                        const total = gradeTotal(g.id);
                        return (
                          <tr key={g.id}
                            onClick={() => setPreviewGradeId(g.id)}
                            className="cursor-pointer hover:bg-slate-100/70 transition"
                            style={{ backgroundColor: gi % 2 === 0 ? '#fff' : '#f9fafb' }}>
                            <td className="px-4 py-2 text-slate-600">{g.name}</td>
                            <td className="px-4 py-2 text-right">
                              <span className="font-semibold text-slate-800">
                                {total > 0 ? ghs(total) : <span className="text-slate-300">—</span>}
                              </span>
                              <span className="ml-2 text-[11px] font-medium" style={{ color: 'var(--accent)' }}>Preview →</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <p className="mt-2.5 text-xs text-slate-400 text-right">
                Totals show a full bill incl. one-time / yearly items; those are only charged per their frequency.
                Changes apply to the next invoices generated — already-generated invoices are unaffected. Unpaid balances carry forward.
              </p>
            </>
          )}
        </>
      )}

      <InvoicePreviewModal data={previewData} onClose={() => setPreviewGradeId(null)} />
    </div>
  );
}
