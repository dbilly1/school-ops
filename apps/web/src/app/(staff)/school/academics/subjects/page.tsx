'use client';

import { useState, useCallback } from 'react';
import { staffApi, type ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { useStaffAuth } from '@/contexts/staff-auth';
import { SaveButton, Alert } from '@/components/ui/settings-card';
import { Modal } from '@/components/ui/modal';

// ── Types ─────────────────────────────────────────────────────────────────────

type GradeLevel   = { id: string; name: string; sequence: number };
type SubjectGrade = { gradeLevel: { id: string; name: string } };
type Subject      = { id: string; name: string; code: string | null; gradeLevels: SubjectGrade[] };

// ── Delete confirmation modal ─────────────────────────────────────────────────

function DeleteSubjectModal({ subject, open, onClose, onDeleted }: {
  subject: Subject;
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  async function confirm() {
    setError(null);
    setDeleting(true);
    try {
      await staffApi.delete(`/school/subjects/${subject.id}`);
      onDeleted();
      onClose();
    } catch (err) {
      setError((err as ApiError).message ?? 'Failed to delete subject.');
    } finally {
      setDeleting(false);
    }
  }

  function handleClose() {
    if (deleting) return;
    setError(null);
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Delete subject">
      <div className="space-y-4">
        {/* Icon + message */}
        <div className="flex gap-4">
          <div className="shrink-0 w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
            <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">
              Delete &ldquo;{subject.name}&rdquo;?
            </p>
            <p className="text-sm text-slate-500 mt-1">
              This will remove the subject from all grade levels and timetable slots. This action cannot be undone.
            </p>
          </div>
        </div>

        {/* Error */}
        {error && <Alert type="error" message={error} />}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-1">
          <button
            onClick={handleClose}
            disabled={deleting}
            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={deleting}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-red-500 hover:bg-red-600 transition disabled:opacity-50 flex items-center gap-2"
          >
            {deleting && (
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            )}
            {deleting ? 'Deleting…' : 'Yes, delete'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Subject card ──────────────────────────────────────────────────────────────

function SubjectCard({ subject, grades, onRefetch, readOnly }: {
  subject: Subject;
  grades: GradeLevel[];
  onRefetch: () => void;
  readOnly?: boolean;
}) {
  const [editing, setEditing]         = useState(false);
  const [name, setName]               = useState(subject.name);
  const [code, setCode]               = useState(subject.code ?? '');
  const [addGradeId, setAddGradeId]   = useState('');
  const [saving, setSaving]           = useState(false);
  const [removingGl, setRemovingGl]   = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const assignedIds = new Set(subject.gradeLevels.map(g => g.gradeLevel.id));
  const unassigned  = grades.filter(g => !assignedIds.has(g.id));

  async function save() {
    setSaving(true);
    try {
      await staffApi.patch(`/school/subjects/${subject.id}`, {
        name: name.trim() || subject.name,
        code: code.trim() || null,
      });
      setEditing(false);
      onRefetch();
    } finally {
      setSaving(false);
    }
  }

  async function assignGrade() {
    if (!addGradeId) return;
    setSaving(true);
    try {
      if (addGradeId === '__all__') {
        for (const g of unassigned) {
          await staffApi.post(`/school/subjects/${subject.id}/grade-levels`, { gradeLevelId: g.id });
        }
      } else {
        await staffApi.post(`/school/subjects/${subject.id}/grade-levels`, { gradeLevelId: addGradeId });
      }
      setAddGradeId('');
      onRefetch();
    } finally {
      setSaving(false);
    }
  }

  async function removeGrade(gradeLevelId: string) {
    setRemovingGl(gradeLevelId);
    try {
      await staffApi.delete(`/school/subjects/${subject.id}/grade-levels/${gradeLevelId}`);
      onRefetch();
    } finally {
      setRemovingGl(null);
    }
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            {editing ? (
              <div className="space-y-2">
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full text-sm font-semibold text-slate-800 border-b border-slate-300 outline-none bg-transparent"
                  autoFocus
                />
                <input
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  placeholder="Subject code (optional)"
                  className="w-full text-xs text-slate-400 border-b border-slate-200 outline-none bg-transparent"
                />
              </div>
            ) : (
              <>
                <p className="text-sm font-semibold text-slate-800">{subject.name}</p>
                {subject.code && <p className="text-xs text-slate-400 font-mono">{subject.code}</p>}
              </>
            )}
          </div>
          {!readOnly && (
            <div className="flex items-center gap-2 ml-3 shrink-0">
              {editing ? (
                <>
                  <SaveButton loading={saving} onClick={save} label="Save" />
                  <button onClick={() => setEditing(false)} className="text-xs text-slate-400">Cancel</button>
                </>
              ) : (
                <>
                  <button onClick={() => setEditing(true)} className="text-xs text-slate-400 hover:text-slate-700 transition">Edit</button>
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="text-xs text-red-400 hover:text-red-600 transition"
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Grade levels */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {subject.gradeLevels.map(g => (
            <div key={g.gradeLevel.id} className="flex items-center gap-1 px-2 py-0.5 bg-slate-100 rounded-lg text-xs text-slate-600">
              <span>{g.gradeLevel.name}</span>
              {!readOnly && (
                <button
                  onClick={() => removeGrade(g.gradeLevel.id)}
                  disabled={removingGl === g.gradeLevel.id}
                  className="text-slate-300 hover:text-red-400 transition disabled:opacity-40"
                >
                  ×
                </button>
              )}
            </div>
          ))}
          {subject.gradeLevels.length === 0 && (
            <span className="text-xs text-slate-300 italic">No grade levels assigned</span>
          )}
        </div>

        {/* Assign grade level */}
        {!readOnly && unassigned.length > 0 && (
          <div className="flex gap-2">
            <select
              value={addGradeId}
              onChange={e => setAddGradeId(e.target.value)}
              className="flex-1 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 outline-none"
            >
              <option value="">Add to grade level…</option>
              {unassigned.length > 1 && <option value="__all__">All remaining grades</option>}
              {unassigned.sort((a,b) => a.sequence - b.sequence).map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            <button
              onClick={assignGrade}
              disabled={saving || !addGradeId}
              className="text-xs font-medium px-3 py-1.5 rounded-lg text-white transition disabled:opacity-50"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              Add
            </button>
          </div>
        )}
      </div>

      <DeleteSubjectModal
        subject={subject}
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onDeleted={onRefetch}
      />
    </>
  );
}

// ── New subject modal ─────────────────────────────────────────────────────────

function NewSubjectModal({ open, onClose, grades, onCreated }: {
  open: boolean; onClose: () => void;
  grades: GradeLevel[]; onCreated: () => void;
}) {
  const [name, setName]           = useState('');
  const [code, setCode]           = useState('');
  const [selectedGrades, setSelectedGrades] = useState<string[]>([]);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);

  function toggleGrade(id: string) {
    setSelectedGrades(g => g.includes(id) ? g.filter(x => x !== id) : [...g, id]);
  }

  async function create() {
    if (!name.trim()) { setError('Subject name is required.'); return; }
    setError(null); setSaving(true);
    try {
      const subject = await staffApi.post<Subject>('/school/subjects', {
        name: name.trim(),
        code: code.trim() || null,
      });
      for (const gradeLevelId of selectedGrades) {
        await staffApi.post(`/school/subjects/${subject.id}/grade-levels`, { gradeLevelId });
      }
      setName(''); setCode(''); setSelectedGrades([]);
      onCreated(); onClose();
    } catch (err) {
      setError((err as ApiError).message ?? 'Failed to create subject.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add subject">
      <div className="space-y-4">
        {error && <Alert type="error" message={error} />}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Subject name<span className="text-red-400 ml-0.5">*</span></label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Mathematics"
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 outline-none"
              onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
              onBlur={e => e.currentTarget.style.boxShadow = ''} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Code (optional)</label>
            <input value={code} onChange={e => setCode(e.target.value)} placeholder="e.g. MATH"
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 outline-none"
              onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
              onBlur={e => e.currentTarget.style.boxShadow = ''} />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-slate-700">Assign to grade levels</label>
            <button
              type="button"
              onClick={() => {
                const allIds = grades.map(g => g.id);
                const allSelected = allIds.every(id => selectedGrades.includes(id));
                setSelectedGrades(allSelected ? [] : allIds);
              }}
              className="text-xs font-medium transition"
              style={{ color: 'var(--accent)' }}
            >
              {grades.every(g => selectedGrades.includes(g.id)) ? 'Deselect all' : 'Select all'}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {grades.sort((a,b) => a.sequence - b.sequence).map(g => (
              <button key={g.id} type="button" onClick={() => toggleGrade(g.id)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border transition"
                style={selectedGrades.includes(g.id)
                  ? { backgroundColor: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff' }
                  : { borderColor: '#e2e8f0', color: '#475569' }}>
                {g.name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <SaveButton loading={saving} onClick={create} label="Create subject" />
        </div>
      </div>
    </Modal>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SubjectsPage() {
  const { isOwner, isAdmin } = useStaffAuth();
  const readOnly = !isOwner && !isAdmin;

  const [showNew, setShowNew]     = useState(false);
  const [gradeFilter, setGradeFilter] = useState('');
  const [search, setSearch]       = useState('');

  const fetchSubjects = useCallback(
    () => staffApi.get<Subject[]>(`/school/subjects${gradeFilter ? `?gradeLevelId=${gradeFilter}` : ''}`),
    [gradeFilter],
  );
  const fetchGrades   = useCallback(() => staffApi.get<GradeLevel[]>('/school/grade-structure/grade-levels'), []);

  const { data: subjects, loading, refetch } = useApi(fetchSubjects);
  const { data: grades }                     = useApi(fetchGrades);

  const filtered = subjects?.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) || (s.code?.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Subjects</h2>
          <p className="text-sm text-slate-500 mt-0.5">Define subjects and assign them to grade levels.</p>
        </div>
        {!readOnly && (
          <button
            onClick={() => setShowNew(true)}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition"
            style={{ backgroundColor: 'var(--accent)' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--accent-hover)'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--accent)'}
          >
            + Add subject
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-5">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search subjects…"
          className="w-52 px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 outline-none"
          onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
          onBlur={e => e.currentTarget.style.boxShadow = ''} />
        <select value={gradeFilter} onChange={e => setGradeFilter(e.target.value)}
          className="px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none">
          <option value="">All grade levels</option>
          {grades?.sort((a,b) => a.sequence - b.sequence).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </div>

      {/* Grid */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({length:6}).map((_,i) => <div key={i} className="h-32 bg-slate-100 rounded-xl animate-pulse" />)}
        </div>
      )}
      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered?.map(subject => (
            <SubjectCard key={subject.id} subject={subject} grades={grades ?? []} onRefetch={refetch} readOnly={readOnly} />
          ))}
          {(!filtered || filtered.length === 0) && (
            <p className="col-span-3 text-sm text-slate-400 text-center py-12">
              {search || gradeFilter ? 'No subjects match.' : 'No subjects yet. Add your first one.'}
            </p>
          )}
        </div>
      )}

      <NewSubjectModal
        open={showNew}
        onClose={() => setShowNew(false)}
        grades={grades ?? []}
        onCreated={refetch}
      />
    </div>
  );
}
