'use client';

import { useState, useCallback } from 'react';
import { staffApi, type ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { useStaffAuth } from '@/contexts/staff-auth';
import { Alert } from '@/components/ui/settings-card';

// ── Types ─────────────────────────────────────────────────────────────────────

type Resource = {
  id: string; levelType: string; subjectName: string; title: string;
  description: string | null; fileName: string; fileSize: number;
};
type Link = {
  id: string; levelType: string | null; subjectName: string | null;
  title: string; url: string; description: string | null;
};

const LEVEL_LABEL: Record<string, string> = {
  KG: 'Preschool', LOWER_PRIMARY: 'Lower Primary (B1–B3)', UPPER_PRIMARY: 'Upper Primary (B4–B6)',
  JHS: 'Junior High (B7–B9)', SHS: 'Senior High', OTHER: 'Other',
};
const LEVEL_ORDER = ['KG', 'LOWER_PRIMARY', 'UPPER_PRIMARY', 'JHS', 'SHS', 'OTHER'];

function fmtSize(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CurriculumPage() {
  const { hasRole } = useStaffAuth();
  const canManage = hasRole('SCHOOL_OWNER') || hasRole('SCHOOL_ADMIN') || hasRole('HEADMASTER');

  const [alert, setAlert] = useState<{ type: 'error' | 'success'; message: string } | null>(null);
  const [editing, setEditing] = useState<Link | 'new' | null>(null);

  const fetchResources = useCallback(() => staffApi.get<Resource[]>('/school/curriculum/resources').catch(() => []), []);
  const fetchLinks     = useCallback(() => staffApi.get<Link[]>('/school/curriculum/links').catch(() => []), []);
  const { data: resources, loading: rLoading } = useApi(fetchResources);
  const { data: links, loading: lLoading, refetch: refetchLinks } = useApi(fetchLinks);

  async function download(id: string) {
    try {
      const { url } = await staffApi.get<{ url: string }>(`/school/curriculum/resources/${id}/download`);
      window.open(url, '_blank');
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Could not open the file.' });
    }
  }

  async function deleteLink(l: Link) {
    if (!confirm(`Remove "${l.title}"?`)) return;
    try {
      await staffApi.delete(`/school/curriculum/links/${l.id}`);
      refetchLinks();
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Could not remove.' });
    }
  }

  // Group resources by level → ordered.
  const resByLevel = LEVEL_ORDER
    .map(lv => ({ level: lv, rows: (resources ?? []).filter(r => r.levelType === lv) }))
    .filter(g => g.rows.length > 0);

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-lg font-bold text-slate-900">Curriculum</h2>
        <p className="text-sm text-slate-500 mt-0.5">The GES curriculum for your levels, plus any resources your school adds.</p>
      </div>

      {alert && <div className="mb-4"><Alert type={alert.type} message={alert.message} /></div>}

      {/* Shared GES library */}
      <section className="mb-8">
        <h3 className="text-sm font-bold text-slate-700 mb-2">GES curriculum</h3>
        {rLoading ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />)}</div>
        ) : resByLevel.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 px-6 py-10 text-center text-sm text-slate-400">
            No curriculum documents available yet.
          </div>
        ) : (
          resByLevel.map(group => (
            <div key={group.level} className="mb-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">{LEVEL_LABEL[group.level] ?? group.level}</p>
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm divide-y divide-slate-50">
                {group.rows.map(r => (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{r.title}</p>
                      <p className="text-xs text-slate-400">{r.subjectName} · {r.fileName} · {fmtSize(r.fileSize)}</p>
                    </div>
                    <button onClick={() => download(r.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-700 hover:bg-slate-50 transition shrink-0">
                      Open
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </section>

      {/* School links */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-slate-700">Your school’s resources</h3>
          {canManage && (
            <button onClick={() => setEditing('new')} className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>+ Add link</button>
          )}
        </div>
        {lLoading ? (
          <div className="space-y-2">{[1, 2].map(i => <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />)}</div>
        ) : links && links.length > 0 ? (
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm divide-y divide-slate-50">
            {links.map(l => (
              <div key={l.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-slate-800 hover:underline truncate block">{l.title}</a>
                  <p className="text-xs text-slate-400">
                    {[l.levelType ? (LEVEL_LABEL[l.levelType] ?? l.levelType) : null, l.subjectName].filter(Boolean).join(' · ') || l.url}
                  </p>
                </div>
                {canManage && (
                  <>
                    <button onClick={() => setEditing(l)} className="text-xs font-medium text-slate-500 hover:text-slate-700 transition shrink-0">Edit</button>
                    <button onClick={() => deleteLink(l)} className="text-xs text-red-400 hover:text-red-600 transition shrink-0">Remove</button>
                  </>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 px-6 py-8 text-center text-sm text-slate-400">
            {canManage ? 'No links yet. Add a link to a curriculum document or site.' : 'No resources added yet.'}
          </div>
        )}
      </section>

      {editing && (
        <LinkModal
          link={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refetchLinks(); }}
          onError={m => setAlert({ type: 'error', message: m })}
        />
      )}
    </div>
  );
}

// ── Link modal ──────────────────────────────────────────────────────────────

function LinkModal({ link, onClose, onSaved, onError }: {
  link: Link | null;
  onClose: () => void;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const [title, setTitle]   = useState(link?.title ?? '');
  const [url, setUrl]       = useState(link?.url ?? '');
  const [levelType, setLevelType] = useState(link?.levelType ?? '');
  const [subjectName, setSubjectName] = useState(link?.subjectName ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!title.trim()) { onError('Title is required.'); return; }
    if (!/^https?:\/\//i.test(url.trim())) { onError('Enter a valid http(s) link.'); return; }
    setSaving(true);
    const body = { title: title.trim(), url: url.trim(), levelType: levelType || undefined, subjectName: subjectName.trim() || undefined };
    try {
      if (link) await staffApi.patch(`/school/curriculum/links/${link.id}`, body);
      else await staffApi.post('/school/curriculum/links', body);
      onSaved();
    } catch (err) {
      onError((err as ApiError).message ?? 'Could not save.');
      setSaving(false);
    }
  }

  const inputCls = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-slate-300';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-bold text-slate-900 mb-4">{link ? 'Edit link' : 'Add link'}</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} className={inputCls} autoFocus placeholder="e.g. NaCCA Mathematics curriculum" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Link (URL)</label>
            <input value={url} onChange={e => setUrl(e.target.value)} className={inputCls} placeholder="https://…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Level <span className="text-slate-300">(optional)</span></label>
              <select value={levelType} onChange={e => setLevelType(e.target.value)} className={inputCls}>
                <option value="">—</option>
                {LEVEL_ORDER.map(lv => <option key={lv} value={lv}>{LEVEL_LABEL[lv]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Subject <span className="text-slate-300">(optional)</span></label>
              <input value={subjectName} onChange={e => setSubjectName(e.target.value)} className={inputCls} />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition disabled:opacity-50" style={{ backgroundColor: 'var(--accent)' }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
