'use client';

import { useState, useCallback } from 'react';
import { adminApi, type ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';

type CurriculumSubject = {
  id: string;
  levelType: string;
  name: string;
  code: string | null;
  sequence: number;
};

const LEVELS: { value: string; label: string }[] = [
  { value: 'KG',            label: 'Kindergarten' },
  { value: 'LOWER_PRIMARY', label: 'Lower Primary (B1–B3)' },
  { value: 'UPPER_PRIMARY', label: 'Upper Primary (B4–B6)' },
  { value: 'JHS',           label: 'Junior High (B7–B9)' },
  { value: 'SHS',           label: 'Senior High' },
  { value: 'OTHER',         label: 'Other' },
];
export default function CurriculumPage() {
  const fetchAll = useCallback(() => adminApi.get<CurriculumSubject[]>('/super-admin/curriculum-subjects'), []);
  const { data, loading, refetch } = useApi(fetchAll);

  const [form, setForm] = useState({ levelType: 'LOWER_PRIMARY', name: '', code: '' });
  const [saving, setSaving] = useState(false);
  const [alert, setAlert]   = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  async function add() {
    if (!form.name.trim()) { setAlert({ type: 'error', message: 'Subject name is required.' }); return; }
    setAlert(null); setSaving(true);
    try {
      await adminApi.post('/super-admin/curriculum-subjects', {
        levelType: form.levelType,
        name: form.name.trim(),
        code: form.code.trim() || undefined,
      });
      setForm(f => ({ ...f, name: '', code: '' }));
      refetch();
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Failed to add subject.' });
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Remove "${name}" from the catalog? Schools that already applied it keep their copy.`)) return;
    await adminApi.delete(`/super-admin/curriculum-subjects/${id}`);
    refetch();
  }

  async function rename(row: CurriculumSubject, name: string) {
    if (!name.trim() || name === row.name) return;
    await adminApi.patch(`/super-admin/curriculum-subjects/${row.id}`, { name: name.trim() });
    refetch();
  }

  const grouped = LEVELS.map(l => ({
    ...l,
    rows: (data ?? []).filter(r => r.levelType === l.value).sort((a, b) => a.sequence - b.sequence || a.name.localeCompare(b.name)),
  }));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">GES Curriculum Subjects</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          The default subject catalog schools apply during setup, grouped by education level. Edits here affect future applies only — schools that already applied keep their own copies.
        </p>
      </div>

      {alert && (
        <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm ${alert.type === 'error' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
          {alert.message}
        </div>
      )}

      {/* Add form */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Level</label>
          <select value={form.levelType} onChange={e => setForm(f => ({ ...f, levelType: e.target.value }))}
            className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none">
            {LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs font-medium text-slate-500 mb-1">Subject name</label>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && add()} placeholder="e.g. Integrated Science"
            className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 outline-none" />
        </div>
        <div className="w-28">
          <label className="block text-xs font-medium text-slate-500 mb-1">Code</label>
          <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
            placeholder="optional"
            className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 outline-none" />
        </div>
        <button onClick={add} disabled={saving}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition disabled:opacity-50"
          style={{ backgroundColor: 'var(--accent, #1a56db)' }}>
          {saving ? 'Adding…' : 'Add subject'}
        </button>
      </div>

      {loading && <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}</div>}

      {!loading && grouped.map(group => (
        <div key={group.value} className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-sm font-bold text-slate-700">{group.label}</h2>
            <span className="text-xs text-slate-400">· {group.rows.length}</span>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm divide-y divide-slate-50">
            {group.rows.length === 0 && <p className="px-4 py-3 text-sm text-slate-300 italic">No subjects for this level.</p>}
            {group.rows.map(row => (
              <div key={row.id} className="flex items-center gap-3 px-4 py-2.5">
                <input
                  defaultValue={row.name}
                  onBlur={e => rename(row, e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  className="flex-1 text-sm text-slate-800 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-slate-300 outline-none"
                />
                {row.code && <span className="text-xs font-mono text-slate-400">{row.code}</span>}
                <button onClick={() => remove(row.id, row.name)} className="text-xs text-red-400 hover:text-red-600 transition">Remove</button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
