'use client';

import { useState, useEffect, useCallback } from 'react';
import { staffApi, type ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';

// ── Types ─────────────────────────────────────────────────────────────────────

type Term = {
  id: string;
  name: string;
  sequence: number;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
};

type AcademicYear = {
  id: string;
  name: string;
  isActive: boolean;
  terms: Term[];
};

// ── Term row ──────────────────────────────────────────────────────────────────

// Convert ISO timestamp or any date string to YYYY-MM-DD for <input type="date">
function toDateInput(d: string | null | undefined): string {
  if (!d) return '';
  return d.slice(0, 10); // "2025-09-01T00:00:00.000Z" → "2025-09-01"
}

function TermRow({ term, onRefetch }: { term: Term; onRefetch: () => void }) {
  const [startDate, setStartDate] = useState(() => toDateInput(term.startDate));
  const [endDate, setEndDate]     = useState(() => toDateInput(term.endDate));
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);

  // Re-sync local state when the term prop updates after refetch
  useEffect(() => {
    setStartDate(toDateInput(term.startDate));
    setEndDate(toDateInput(term.endDate));
  }, [term.startDate, term.endDate]);

  async function save() {
    setSaving(true); setSaved(false);
    try {
      await staffApi.patch(`/school/academic-years/terms/${term.id}`, {
        startDate: startDate || null,
        endDate:   endDate   || null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onRefetch();
    } finally {
      setSaving(false);
    }
  }

  async function activate() {
    await staffApi.patch(`/school/academic-years/terms/${term.id}/activate`);
    onRefetch();
  }

  return (
    <div
      className="border rounded-xl px-4 py-3.5"
      style={term.isActive
        ? { borderColor: 'var(--accent)', backgroundColor: 'var(--accent-tint, #f0fdf4)' }
        : { borderColor: '#e2e8f0' }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-800">{term.name}</span>
          {term.isActive && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: 'var(--accent)' }}>
              Active
            </span>
          )}
          {saved && <span className="text-xs text-green-600">Saved ✓</span>}
        </div>
        <div className="flex items-center gap-3">
          {!term.isActive && (
            <button onClick={activate} className="text-xs font-medium transition" style={{ color: 'var(--accent)' }}>
              Set active
            </button>
          )}
          <button
            onClick={save} disabled={saving}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-white transition disabled:opacity-50"
            style={{ backgroundColor: 'var(--accent)' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--accent-hover)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'var(--accent)')}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Start date</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-700 outline-none transition bg-white"
            onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
            onBlur={e => e.currentTarget.style.boxShadow = ''} />
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">End date</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-700 outline-none transition bg-white"
            onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
            onBlur={e => e.currentTarget.style.boxShadow = ''} />
        </div>
      </div>

      {(!startDate || !endDate) && (
        <p className="text-xs text-slate-400 mt-2">Dates are optional — fill them in whenever you're ready.</p>
      )}
    </div>
  );
}

// ── Academic year card ─────────────────────────────────────────────────────────

function YearCard({ year, onRefetch }: { year: AcademicYear; onRefetch: () => void }) {
  const [expanded, setExpanded] = useState(year.isActive);

  async function activate() {
    await staffApi.patch(`/school/academic-years/${year.id}/activate`);
    onRefetch();
  }

  const sorted = [...year.terms].sort((a, b) => a.sequence - b.sequence);

  return (
    <div
      className="border rounded-xl overflow-hidden mb-3"
      style={year.isActive ? { borderColor: 'var(--accent)' } : { borderColor: '#e2e8f0' }}
    >
      <div
        className="flex items-center justify-between px-4 py-3.5 cursor-pointer hover:bg-slate-50 transition"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-800">{year.name}</span>
          {year.isActive && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: 'var(--accent)' }}>
              Active year
            </span>
          )}
        </div>
        <div className="flex items-center gap-3" onClick={e => e.stopPropagation()}>
          {!year.isActive && (
            <button onClick={activate} className="text-xs font-medium transition" style={{ color: 'var(--accent)' }}>
              Set active
            </button>
          )}
          <span className="text-slate-400 text-sm select-none">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-100 pt-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Terms</p>
          {sorted.map(term => (
            <TermRow key={term.id} term={term} onRefetch={onRefetch} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── New year form ──────────────────────────────────────────────────────────────

type DraftTerm = { name: string; startDate: string; endDate: string };

function NewYearForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen]         = useState(false);
  const [yearName, setYearName] = useState('');
  const [terms, setTerms]       = useState<DraftTerm[]>([
    { name: 'Term 1', startDate: '', endDate: '' },
    { name: 'Term 2', startDate: '', endDate: '' },
    { name: 'Term 3', startDate: '', endDate: '' },
  ]);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);

  function updateTerm(i: number, field: keyof DraftTerm, value: string) {
    setTerms(t => t.map((term, idx) => idx === i ? { ...term, [field]: value } : term));
  }

  async function create() {
    if (!yearName.trim()) { setError('Please enter an academic year name.'); return; }
    setError(null); setSaving(true);
    try {
      await staffApi.post('/school/academic-years', {
        name: yearName.trim(),
        terms: terms.map((t, i) => ({
          name:      t.name,
          sequence:  i + 1,
          startDate: t.startDate || null,
          endDate:   t.endDate   || null,
        })),
      });
      setOpen(false);
      setYearName('');
      setTerms([
        { name: 'Term 1', startDate: '', endDate: '' },
        { name: 'Term 2', startDate: '', endDate: '' },
        { name: 'Term 3', startDate: '', endDate: '' },
      ]);
      onCreated();
    } catch (err) {
      setError((err as ApiError).message ?? 'Failed to create academic year.');
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full py-2.5 border border-dashed border-slate-300 rounded-xl text-sm text-slate-400 hover:border-slate-400 hover:text-slate-500 transition mt-2"
      >
        + Add academic year
      </button>
    );
  }

  return (
    <div className="border border-slate-200 rounded-xl px-4 py-4 mt-2">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-slate-800">New academic year</p>
        <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 text-lg leading-none">×</button>
      </div>

      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

      <div className="mb-5">
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Academic year name</label>
        <input
          value={yearName} onChange={e => setYearName(e.target.value)} placeholder="e.g. 2025/2026"
          className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 outline-none transition"
          onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
          onBlur={e => e.currentTarget.style.boxShadow = ''} />
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm font-medium text-slate-700">Terms</label>
          <button
            onClick={() => setTerms(t => [...t, { name: `Term ${t.length + 1}`, startDate: '', endDate: '' }])}
            className="text-xs font-medium transition" style={{ color: 'var(--accent)' }}
          >
            + Add term
          </button>
        </div>
        <div className="space-y-3">
          {terms.map((term, i) => (
            <div key={i} className="border border-slate-200 rounded-xl px-4 py-3.5">
              <div className="flex items-center justify-between mb-3">
                <input value={term.name} onChange={e => updateTerm(i, 'name', e.target.value)}
                  className="text-sm font-semibold text-slate-800 border-none outline-none bg-transparent" />
                {terms.length > 1 && (
                  <button onClick={() => setTerms(t => t.filter((_, idx) => idx !== i))}
                    className="text-slate-300 hover:text-red-400 transition text-lg leading-none">×</button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Start date</label>
                  <input type="date" value={term.startDate} onChange={e => updateTerm(i, 'startDate', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-700 outline-none transition"
                    onFocus={e => e.currentTarget.style.boxShadow='0 0 0 2px var(--accent)'}
                    onBlur={e => e.currentTarget.style.boxShadow=''} />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">End date</label>
                  <input type="date" value={term.endDate} onChange={e => updateTerm(i, 'endDate', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-700 outline-none transition"
                    onFocus={e => e.currentTarget.style.boxShadow='0 0 0 2px var(--accent)'}
                    onBlur={e => e.currentTarget.style.boxShadow=''} />
                </div>
              </div>
              {(!term.startDate || !term.endDate) && (
                <p className="text-xs text-slate-400 mt-2">Dates are optional — you can set them later.</p>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-end gap-3">
        <button onClick={() => setOpen(false)} className="text-sm text-slate-400 hover:text-slate-600">Cancel</button>
        <button
          onClick={create} disabled={saving}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white transition disabled:opacity-50"
          style={{ backgroundColor: 'var(--accent)' }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--accent-hover)')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'var(--accent)')}
        >
          {saving ? 'Creating…' : 'Create year'}
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AcademicYearPage() {
  const fetchYears = useCallback(() => staffApi.get<AcademicYear[]>('/school/academic-years'), []);
  const { data: years, loading, error, refetch } = useApi(fetchYears);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-bold text-slate-900">Academic Years & Terms</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Manage your school's academic years. Term dates can be filled in at any time.
        </p>
      </div>

      {loading && (
        <div className="space-y-3 mb-4">
          {[1, 2].map(i => <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />)}
        </div>
      )}

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
          Could not load academic years: {error.message}
        </div>
      )}

      {!loading && years && (
        <>
          {years.map(year => <YearCard key={year.id} year={year} onRefetch={refetch} />)}
          {years.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-6">No academic years yet. Add one below.</p>
          )}
        </>
      )}

      {!loading && <NewYearForm onCreated={refetch} />}
    </div>
  );
}
