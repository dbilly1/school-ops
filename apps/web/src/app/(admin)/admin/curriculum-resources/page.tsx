'use client';

import { useState, useCallback, useRef } from 'react';
import { adminApi, type ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';

type Resource = {
  id: string;
  levelTypes: string[];
  subjectName: string;
  title: string;
  description: string | null;
  fileName: string;
  fileSize: number;
  createdAt: string;
};

const LEVELS: { value: string; label: string }[] = [
  { value: 'KG',            label: 'Preschool' },
  { value: 'LOWER_PRIMARY', label: 'Lower Primary (B1–B3)' },
  { value: 'UPPER_PRIMARY', label: 'Upper Primary (B4–B6)' },
  { value: 'JHS',           label: 'Junior High (B7–B9)' },
  { value: 'SHS',           label: 'Senior High' },
  { value: 'OTHER',         label: 'Other' },
];

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function CurriculumResourcesPage() {
  const fetchAll = useCallback(() => adminApi.get<Resource[]>('/super-admin/curriculum-resources'), []);
  const { data, loading, refetch } = useApi(fetchAll);

  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<{ levelTypes: string[]; subjectName: string; title: string; description: string }>(
    { levelTypes: ['LOWER_PRIMARY'], subjectName: '', title: '', description: '' },
  );
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [alert, setAlert]   = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  function toggleLevel(value: string) {
    setForm(f => ({
      ...f,
      levelTypes: f.levelTypes.includes(value)
        ? f.levelTypes.filter(v => v !== value)
        : [...f.levelTypes, value],
    }));
  }

  async function upload() {
    if (form.levelTypes.length === 0) { setAlert({ type: 'error', message: 'Select at least one level.' }); return; }
    if (!form.subjectName.trim() || !form.title.trim()) { setAlert({ type: 'error', message: 'Subject and title are required.' }); return; }
    if (!file) { setAlert({ type: 'error', message: 'Choose a file to upload.' }); return; }
    setAlert(null); setSaving(true);
    try {
      const fd = new FormData();
      // Keep level order canonical so cumulative docs group predictably.
      const ordered = LEVELS.filter(l => form.levelTypes.includes(l.value)).map(l => l.value);
      fd.append('levelTypes', ordered.join(','));
      fd.append('subjectName', form.subjectName.trim());
      fd.append('title', form.title.trim());
      if (form.description.trim()) fd.append('description', form.description.trim());
      fd.append('file', file);
      await adminApi.upload('/super-admin/curriculum-resources', fd);
      setForm(f => ({ ...f, subjectName: '', title: '', description: '' }));
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      setAlert({ type: 'success', message: 'Uploaded.' });
      refetch();
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Upload failed.' });
    } finally {
      setSaving(false);
    }
  }

  async function download(id: string) {
    try {
      const { url } = await adminApi.get<{ url: string }>(`/super-admin/curriculum-resources/${id}/download`);
      window.open(url, '_blank');
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Could not open the file.' });
    }
  }

  async function remove(r: Resource) {
    if (!confirm(`Delete "${r.title}"? This removes the file for every school.`)) return;
    await adminApi.delete(`/super-admin/curriculum-resources/${r.id}`);
    refetch();
  }

  const grouped = LEVELS.map(l => ({ ...l, rows: (data ?? []).filter(r => r.levelTypes?.includes(l.value)) }));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">GES Curriculum Library</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Upload the official GES curriculum documents once — every school sees the set relevant to the levels they run.
        </p>
      </div>

      {alert && (
        <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm ${alert.type === 'error' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
          {alert.message}
        </div>
      )}

      {/* Upload form */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 mb-6 space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">
            Levels <span className="text-slate-300">(pick all this document covers)</span>
          </label>
          <div className="flex flex-wrap gap-1.5">
            {LEVELS.map(l => {
              const on = form.levelTypes.includes(l.value);
              return (
                <button key={l.value} type="button" onClick={() => toggleLevel(l.value)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition ${
                    on ? 'border-transparent text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                  style={on ? { backgroundColor: 'var(--accent, #1a56db)' } : undefined}>
                  {l.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-48">
            <label className="block text-xs font-medium text-slate-500 mb-1">Subject</label>
            <input value={form.subjectName} onChange={e => setForm(f => ({ ...f, subjectName: e.target.value }))}
              placeholder="e.g. Mathematics"
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 outline-none" />
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-medium text-slate-500 mb-1">Title</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Mathematics Curriculum (B4–B6)"
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 outline-none" />
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-medium text-slate-500 mb-1">Description <span className="text-slate-300">(optional)</span></label>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 outline-none" />
          </div>
          <input ref={fileRef} type="file" accept=".pdf,.doc,.docx" onChange={e => setFile(e.target.files?.[0] ?? null)}
            className="text-sm text-slate-600 file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-700 file:text-sm" />
          <button onClick={upload} disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition disabled:opacity-50"
            style={{ backgroundColor: 'var(--accent, #1a56db)' }}>
            {saving ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </div>

      {loading && <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}</div>}

      {!loading && grouped.map(group => (
        <div key={group.value} className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-sm font-bold text-slate-700">{group.label}</h2>
            <span className="text-xs text-slate-400">· {group.rows.length}</span>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm divide-y divide-slate-50">
            {group.rows.length === 0 && <p className="px-4 py-3 text-sm text-slate-300 italic">Nothing uploaded for this level.</p>}
            {group.rows.map(r => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{r.title}</p>
                  <p className="text-xs text-slate-400">{r.subjectName} · {r.fileName} · {fmtSize(r.fileSize)}</p>
                </div>
                <button onClick={() => download(r.id)} className="text-xs font-medium" style={{ color: 'var(--accent, #1a56db)' }}>Open</button>
                <button onClick={() => remove(r)} className="text-xs text-red-400 hover:text-red-600 transition">Delete</button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
