'use client';

import { useState, useCallback, useEffect } from 'react';
import { staffApi, type ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';

// ── Types ─────────────────────────────────────────────────────────────────────

type GradeLevel      = { id: string; name: string; sequence: number };
type StudentCategory = { id: string; name: string };
type Term            = { id: string; name: string; isActive: boolean };
type AcademicYear    = { id: string; name: string; isActive: boolean; terms: Term[] };
type FeeStructure    = {
  id: string;
  amount: number;
  gradeLevelId: string;
  studentCategoryId: string;
  termId: string;
};

// cells[termId][gradeId][catId] = amount string
type CellMap = Record<string, Record<string, Record<string, string>>>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildCellMap(structures: FeeStructure[]): CellMap {
  const map: CellMap = {};
  for (const s of structures) {
    if (!map[s.termId]) map[s.termId] = {};
    if (!map[s.termId][s.gradeLevelId]) map[s.termId][s.gradeLevelId] = {};
    map[s.termId][s.gradeLevelId][s.studentCategoryId] = String(s.amount);
  }
  return map;
}

// Shorten long category names so they fit in narrow columns
function abbrev(name: string, max = 10): string {
  return name.length > max ? name.slice(0, max - 1) + '…' : name;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FeeStructuresPage() {

  // ── Fetch reference data ──────────────────────────────────────────────────

  const fetchGrades  = useCallback(() => staffApi.get<GradeLevel[]>('/school/grade-structure/grade-levels'), []);
  const fetchCats    = useCallback(() => staffApi.get<StudentCategory[]>('/school/student-categories'), []);
  const fetchYears   = useCallback(() => staffApi.get<AcademicYear[]>('/school/academic-years'), []);
  const fetchAll     = useCallback(() => staffApi.get<FeeStructure[]>('/school/finance/fee-structures'), []);

  const { data: grades }     = useApi(fetchGrades);
  const { data: categories } = useApi(fetchCats);
  const { data: years, loading: loadingYears } = useApi(fetchYears);
  const { data: structures, loading: loadingFees, refetch } = useApi(fetchAll);

  // Use the active year's terms; fall back to the first year if none active
  const activeYear = years?.find(y => y.isActive) ?? years?.[0];
  const terms: Term[] = activeYear?.terms.slice().sort((a, b) => {
    // sort by name heuristic (Term 1, Term 2 …) — works for any naming
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  }) ?? [];

  // ── Cell state ─────────────────────────────────────────────────────────────

  const [cells, setCells]     = useState<CellMap>({});
  const [dirty, setDirty]     = useState(false);
  const [saving, setSaving]   = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Rebuild when fee data loads or changes
  useEffect(() => {
    setCells(buildCellMap(structures ?? []));
    setDirty(false);
    setSaveMsg(null);
  }, [structures]);

  function handleChange(termId: string, gradeId: string, catId: string, value: string) {
    setCells(prev => ({
      ...prev,
      [termId]: {
        ...(prev[termId] ?? {}),
        [gradeId]: {
          ...(prev[termId]?.[gradeId] ?? {}),
          [catId]: value,
        },
      },
    }));
    setDirty(true);
    setSaveMsg(null);
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  async function save() {
    setSaving(true);
    setSaveMsg(null);
    let totalSaved = 0;

    try {
      // One matrix call per term, all in parallel
      await Promise.all(
        terms.map(async term => {
          const termCells = cells[term.id] ?? {};
          const payload: { gradeLevelId: string; studentCategoryId: string; amount: number }[] = [];

          for (const [gradeId, catMap] of Object.entries(termCells)) {
            for (const [catId, raw] of Object.entries(catMap)) {
              const amount = parseFloat(raw);
              if (!isNaN(amount) && amount > 0) {
                payload.push({ gradeLevelId: gradeId, studentCategoryId: catId, amount });
              }
            }
          }

          if (payload.length > 0) {
            await staffApi.post('/school/finance/fee-structures/matrix', {
              termId: term.id,
              cells: payload,
            });
            totalSaved += payload.length;
          }
        }),
      );

      setSaveMsg({ ok: true, text: `Saved ${totalSaved} fee${totalSaved !== 1 ? 's' : ''}.` });
      setDirty(false);
      refetch();
    } catch (err) {
      setSaveMsg({ ok: false, text: (err as ApiError).message ?? 'Failed to save.' });
    } finally {
      setSaving(false);
    }
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const sortedGrades = (grades ?? []).slice().sort((a, b) => a.sequence - b.sequence);
  const cats         = categories ?? [];
  const loading      = loadingYears || loadingFees;

  const dirtyCount = Object.values(cells).reduce(
    (sum, termMap) =>
      sum + Object.values(termMap).reduce(
        (s2, catMap) => s2 + Object.values(catMap).filter(v => parseFloat(v) > 0).length,
        0,
      ),
    0,
  );

  // ── Empty states ───────────────────────────────────────────────────────────

  const noSetup = !loading && (terms.length === 0 || sortedGrades.length === 0 || cats.length === 0);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>

      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Fee Structures</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Set fees per grade level, student category and term.
            {activeYear && <span className="ml-1 font-medium text-slate-600">{activeYear.name}</span>}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0 ml-4 mt-0.5">
          {saveMsg && (
            <span className={`text-sm ${saveMsg.ok ? 'text-green-600' : 'text-red-500'}`}>
              {saveMsg.text}
            </span>
          )}
          <button
            onClick={save}
            disabled={saving || !dirty}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition disabled:opacity-40"
            style={{ backgroundColor: 'var(--accent)' }}
            onMouseEnter={e => !saving && dirty && (e.currentTarget.style.backgroundColor = 'var(--accent-hover)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'var(--accent)')}
          >
            {saving
              ? 'Saving…'
              : dirty
                ? `Save changes${dirtyCount > 0 ? ` (${dirtyCount})` : ''}`
                : 'Saved'}
          </button>
        </div>
      </div>

      {/* ── Itemised-fees pointer ── */}
      <div className="px-4 py-3 mb-4 bg-sky-50 border border-sky-200 rounded-xl text-sm text-sky-800">
        Want to break fees into <strong>Tuition, PTA, Exams…</strong> instead of one figure? Use{' '}
        <a href="/school/finance/fee-setup" className="font-semibold underline">Fee Setup</a>. When a category
        is set up there, invoice generation uses those itemised fees and ignores the flat amount below — this
        page is the simple fallback for categories you haven’t itemised.
      </div>

      {/* ── Setup warnings ── */}
      {!loading && terms.length === 0 && (
        <div className="px-4 py-3 mb-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
          No academic year set up yet. Go to <strong>Settings → Academic Years</strong> to create one first.
        </div>
      )}
      {!loading && terms.length > 0 && sortedGrades.length === 0 && (
        <div className="px-4 py-3 mb-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
          No grade levels set up yet. Go to <strong>Settings → Grade Structure</strong> to add them first.
        </div>
      )}
      {!loading && terms.length > 0 && cats.length === 0 && (
        <div className="px-4 py-3 mb-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
          No student categories set up yet. Go to <strong>Settings → Student Categories</strong> to add them first.
        </div>
      )}

      {/* ── Matrix table ── */}
      {!noSetup && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="h-10 bg-slate-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">

                {/* ── Column groups for visual separation ── */}
                <colgroup>
                  <col className="w-36" />
                  {terms.map(term =>
                    cats.map(cat => <col key={`${term.id}-${cat.id}`} className="min-w-24" />)
                  )}
                </colgroup>

                <thead>
                  {/* Row 1: term group headers */}
                  <tr>
                    <th
                      rowSpan={2}
                      className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide bg-slate-50 border-b border-slate-200 sticky left-0 z-20 align-bottom"
                      style={{ borderRight: '2px solid #e2e8f0' }}
                    >
                      Grade level
                    </th>
                    {terms.map((term, ti) => (
                      <th
                        key={term.id}
                        colSpan={cats.length}
                        className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide border-b border-slate-200"
                        style={{
                          backgroundColor: term.isActive ? 'var(--accent-tint, #f0fdf4)' : '#f8fafc',
                          color: term.isActive ? 'var(--accent)' : '#94a3b8',
                          borderLeft: ti > 0 ? '2px solid #e2e8f0' : undefined,
                        }}
                      >
                        {term.name}
                        {term.isActive && (
                          <span className="ml-1.5 normal-case font-medium px-1.5 py-0.5 rounded-full text-white text-[10px]"
                            style={{ backgroundColor: 'var(--accent)' }}>
                            Active
                          </span>
                        )}
                      </th>
                    ))}
                  </tr>

                  {/* Row 2: category sub-headers */}
                  <tr>
                    {terms.map((term, ti) =>
                      cats.map((cat, ci) => (
                        <th
                          key={`${term.id}-${cat.id}`}
                          className="px-2 pb-2 pt-1 text-right text-xs font-medium text-slate-400 border-b border-slate-200"
                          style={{
                            backgroundColor: term.isActive ? 'var(--accent-tint, #f0fdf4)' : '#f8fafc',
                            borderLeft: ci === 0 && ti > 0 ? '2px solid #e2e8f0' : undefined,
                          }}
                        >
                          {abbrev(cat.name)}
                        </th>
                      ))
                    )}
                  </tr>
                </thead>

                <tbody>
                  {sortedGrades.map((grade, gi) => (
                    <tr
                      key={grade.id}
                      className="group"
                      style={{ backgroundColor: gi % 2 === 0 ? '#ffffff' : '#f9fafb' }}
                    >
                      {/* Grade name — sticky left */}
                      <td
                        className="px-4 py-2 font-medium text-slate-700 border-b border-slate-100"
                        style={{
                          position: 'sticky', left: 0, zIndex: 10,
                          backgroundColor: gi % 2 === 0 ? '#ffffff' : '#f9fafb',
                          borderRight: '2px solid #e2e8f0',
                        }}
                      >
                        {grade.name}
                      </td>

                      {/* Amount cells — one per term × category */}
                      {terms.map((term, ti) =>
                        cats.map((cat, ci) => {
                          const value = cells[term.id]?.[grade.id]?.[cat.id] ?? '';
                          return (
                            <td
                              key={`${term.id}-${cat.id}`}
                              className="px-1.5 py-1 border-b border-slate-100"
                              style={{
                                borderLeft: ci === 0 && ti > 0 ? '2px solid #e2e8f0' : undefined,
                              }}
                            >
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={value}
                                onChange={e => handleChange(term.id, grade.id, cat.id, e.target.value)}
                                placeholder="—"
                                className="w-full px-2 py-1.5 text-right text-sm border border-transparent rounded-lg outline-none transition
                                  placeholder-slate-200 bg-transparent hover:border-slate-200"
                                onFocus={e => {
                                  e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)';
                                  e.currentTarget.style.backgroundColor = '#fff';
                                  e.currentTarget.style.borderColor = 'transparent';
                                }}
                                onBlur={e => {
                                  e.currentTarget.style.boxShadow = '';
                                  e.currentTarget.style.backgroundColor = '';
                                }}
                              />
                            </td>
                          );
                        })
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Footer hint ── */}
      {!noSetup && !loading && (
        <p className="mt-2.5 text-xs text-slate-400 text-right">
          Blank cells are skipped when saving. Tab through to fill quickly.
        </p>
      )}

    </div>
  );
}
