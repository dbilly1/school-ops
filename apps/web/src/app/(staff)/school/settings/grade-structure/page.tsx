'use client';

import { useState, useCallback } from 'react';
import { staffApi, type ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';

type ClassSection = { id: string; name: string };
type GradeLevel   = { id: string; name: string; sequence: number; levelType?: string | null; gradeLevelId?: string; classes: ClassSection[] };

// GES education bands — tagging a grade level lets the GES subject template and
// the right grading scale apply automatically.
const LEVEL_TYPES: { value: string; label: string }[] = [
  { value: '',              label: 'Untagged' },
  { value: 'KG',            label: 'KG' },
  { value: 'LOWER_PRIMARY', label: 'Lower Primary' },
  { value: 'UPPER_PRIMARY', label: 'Upper Primary' },
  { value: 'JHS',           label: 'JHS' },
  { value: 'SHS',           label: 'SHS' },
  { value: 'OTHER',         label: 'Other' },
];

// ── Single grade row (mirrors onboarding step-grade-structure row) ─────────────

function GradeRow({ grade, onRefetch }: { grade: GradeLevel; onRefetch: () => void }) {
  const [editing, setEditing]   = useState(false);
  const [name, setName]         = useState(grade.name);
  const [saving, setSaving]     = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function saveName() {
    if (!name.trim() || name === grade.name) { setEditing(false); return; }
    setSaving(true);
    try {
      await staffApi.patch(`/school/grade-structure/grade-levels/${grade.id}`, { name: name.trim() });
      setEditing(false);
      onRefetch();
    } finally {
      setSaving(false);
    }
  }

  async function addClass() {
    const letter    = String.fromCharCode(65 + grade.classes.length);
    const className = `${grade.name} ${letter}`;
    setSaving(true);
    try {
      await staffApi.post('/school/grade-structure/classes', { gradeLevelId: grade.id, name: className });
      onRefetch();
    } finally {
      setSaving(false);
    }
  }

  async function deleteClass(classId: string) {
    setDeleting(classId);
    try {
      await staffApi.delete(`/school/grade-structure/classes/${classId}`);
      onRefetch();
    } finally {
      setDeleting(null);
    }
  }

  async function deleteGrade() {
    if (!confirm(`Delete "${grade.name}"? This cannot be undone.`)) return;
    await staffApi.delete(`/school/grade-structure/grade-levels/${grade.id}`);
    onRefetch();
  }

  async function setLevelType(value: string) {
    setSaving(true);
    try {
      await staffApi.patch(`/school/grade-structure/grade-levels/${grade.id}`, { levelType: value || null });
      onRefetch();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border border-slate-200 rounded-xl px-4 py-3.5">
      {/* Name row */}
      <div className="flex items-center gap-3">
        <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-semibold text-slate-500 shrink-0">
          {grade.sequence}
        </span>

        {editing ? (
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setEditing(false); setName(grade.name); } }}
            className="flex-1 text-sm font-medium text-slate-800 border-b border-slate-300 outline-none bg-transparent"
            autoFocus
          />
        ) : (
          <span className="flex-1 text-sm font-medium text-slate-800">{grade.name}</span>
        )}

        <div className="flex items-center gap-3 shrink-0">
          {editing ? (
            <>
              <button
                onClick={saveName}
                disabled={saving}
                className="text-xs font-medium transition disabled:opacity-50"
                style={{ color: 'var(--accent)' }}
              >
                {saving ? '…' : 'Save'}
              </button>
              <button
                onClick={() => { setEditing(false); setName(grade.name); }}
                className="text-xs text-slate-400 hover:text-slate-600"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <select
                value={grade.levelType ?? ''}
                onChange={e => setLevelType(e.target.value)}
                disabled={saving}
                title="Education level — used for GES subjects & grading scale"
                className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 outline-none disabled:opacity-50"
              >
                {LEVEL_TYPES.map(lt => <option key={lt.value} value={lt.value}>{lt.label}</option>)}
              </select>
              <button onClick={() => setEditing(true)} className="text-xs text-slate-400 hover:text-slate-700 transition">
                Rename
              </button>
              <button onClick={deleteGrade} className="text-xs text-red-400 hover:text-red-600 transition">
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      {/* Classes row */}
      <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-9">
        {grade.classes.length === 0 && (
          <span className="text-xs text-slate-400 italic">Whole grade is one class</span>
        )}
        {grade.classes.map(cls => (
          <div key={cls.id} className="flex items-center gap-1 bg-slate-100 rounded-lg px-2.5 py-1">
            <span className="text-xs font-medium text-slate-600">{cls.name}</span>
            <button
              onClick={() => deleteClass(cls.id)}
              disabled={deleting === cls.id}
              className="text-slate-300 hover:text-red-400 transition text-sm leading-none ml-1 disabled:opacity-40"
            >
              {deleting === cls.id ? '…' : '×'}
            </button>
          </div>
        ))}
        {grade.classes.length < 8 && (
          <button
            onClick={addClass}
            disabled={saving}
            className="text-xs transition disabled:opacity-50"
            style={{ color: 'var(--accent)' }}
          >
            + Add class
          </button>
        )}
      </div>
    </div>
  );
}

// ── Add grade form ─────────────────────────────────────────────────────────────

function AddGradeForm({ nextSequence, onCreated }: { nextSequence: number; onCreated: () => void }) {
  const [name, setName]     = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  async function create() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setError(null);
    setSaving(true);
    try {
      await staffApi.post('/school/grade-structure/grade-levels', { name: trimmed, sequence: nextSequence });
      setName('');
      onCreated();
    } catch (err) {
      setError((err as ApiError).message ?? 'Failed to add grade level.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-2">
      {error && <p className="mb-2 text-sm text-red-500">{error}</p>}
      <div className="flex gap-2">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && create()}
          placeholder="e.g. Grade 7, SHS 1, Form 4…"
          className="flex-1 px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 outline-none transition"
          onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
          onBlur={e => e.currentTarget.style.boxShadow = ''}
        />
        <button
          onClick={create}
          disabled={saving || !name.trim()}
          className="px-4 py-2.5 rounded-xl text-sm font-medium text-white transition disabled:opacity-50"
          style={{ backgroundColor: 'var(--accent)' }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--accent-hover)')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'var(--accent)')}
        >
          {saving ? 'Adding…' : 'Add grade'}
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function GradeStructurePage() {
  const fetchAll = useCallback(async () => {
    const [grades, classes] = await Promise.all([
      staffApi.get<GradeLevel[]>('/school/grade-structure/grade-levels'),
      staffApi.get<(ClassSection & { gradeLevelId: string })[]>('/school/grade-structure/classes'),
    ]);
    return grades
      .sort((a, b) => a.sequence - b.sequence)
      .map(g => ({ ...g, classes: classes.filter(c => c.gradeLevelId === g.id) }));
  }, []);

  const { data: grades, loading, error, refetch } = useApi(fetchAll);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-bold text-slate-900">Grade Structure</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Define your grade levels. Each grade is one class by default — add more classes if a grade has multiple streams.
        </p>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3 mb-4">
          {[1, 2, 3].map(i => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
          Could not load grade structure: {error.message}
        </div>
      )}

      {/* Grade rows */}
      {!loading && grades && (
        <div className="space-y-3 mb-4">
          {grades.map(grade => (
            <GradeRow key={grade.id} grade={grade} onRefetch={refetch} />
          ))}
          {grades.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-6">
              No grade levels yet. Add your first one below.
            </p>
          )}
        </div>
      )}

      {/* Add form */}
      {!loading && (
        <AddGradeForm nextSequence={(grades?.length ?? 0) + 1} onCreated={refetch} />
      )}
    </div>
  );
}
