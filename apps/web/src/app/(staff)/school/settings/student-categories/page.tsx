'use client';

import { useState, useCallback } from 'react';
import { staffApi, type ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';

type Category = { id: string; name: string };

const SUGGESTIONS = ['Day', 'Boarding', 'International', 'New Entrant', 'Returning'];

export default function StudentCategoriesPage() {
  const fetchCats = useCallback(() => staffApi.get<Category[]>('/school/student-categories'), []);
  const { data: categories, loading, error, refetch } = useApi(fetchCats);

  const [input, setInput]       = useState('');
  const [saving, setSaving]     = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  async function add() {
    const name = input.trim();
    if (!name) return;
    setAddError(null);
    setSaving(true);
    try {
      await staffApi.post('/school/student-categories', { name });
      setInput('');
      refetch();
    } catch (err) {
      setAddError((err as ApiError).message ?? 'Failed to add category.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    setDeleting(id);
    try {
      await staffApi.delete(`/school/student-categories/${id}`);
      refetch();
    } finally {
      setDeleting(null);
    }
  }

  const existingNames = new Set(categories?.map(c => c.name) ?? []);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-bold text-slate-900">Student Categories</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Fee structures are assigned per category. Define all the student types your school has.
        </p>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="flex flex-wrap gap-2 mb-6">
          {[1, 2, 3].map(i => <div key={i} className="h-9 w-20 bg-slate-100 rounded-lg animate-pulse" />)}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
          Could not load categories: {error.message}
        </div>
      )}

      {/* Category chips */}
      {!loading && (
        <div className="flex flex-wrap gap-2 mb-6 min-h-10">
          {categories?.map(cat => (
            <div
              key={cat.id}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              <span>{cat.name}</span>
              <button
                onClick={() => remove(cat.id)}
                disabled={deleting === cat.id}
                className="text-white/70 hover:text-white transition text-base leading-none disabled:opacity-40"
              >
                {deleting === cat.id ? '…' : '×'}
              </button>
            </div>
          ))}
          {(!categories || categories.length === 0) && (
            <p className="text-sm text-slate-400 italic">No categories added yet.</p>
          )}
        </div>
      )}

      {/* Add input */}
      {addError && <p className="mb-2 text-sm text-red-500">{addError}</p>}
      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="Type a category name and press Enter"
          className="flex-1 px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 outline-none transition"
          onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
          onBlur={e => e.currentTarget.style.boxShadow = ''}
        />
        <button
          onClick={add}
          disabled={saving || !input.trim()}
          className="px-4 py-2.5 rounded-xl text-sm font-medium text-white transition disabled:opacity-50"
          style={{ backgroundColor: 'var(--accent)' }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--accent-hover)')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'var(--accent)')}
        >
          {saving ? 'Adding…' : 'Add'}
        </button>
      </div>

      {/* Suggestions */}
      <div className="mt-4">
        <p className="text-xs text-slate-400 mb-2">Common categories:</p>
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.filter(s => !existingNames.has(s)).map(s => (
            <button
              key={s}
              onClick={async () => {
                setSaving(true);
                try {
                  await staffApi.post('/school/student-categories', { name: s });
                  refetch();
                } finally {
                  setSaving(false);
                }
              }}
              disabled={saving}
              className="px-3 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition disabled:opacity-50"
            >
              + {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
