'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { staffApi, type ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { useTeacherScope } from '@/hooks/use-teacher-scope';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/cn';

// ── Types ─────────────────────────────────────────────────────────────────────

type ClassAssignment = {
  class: {
    id: string;
    name: string;
    gradeLevel: { id: string; name: string };
  };
};

type StudentListItem = {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  gender: string | null;
  dateOfBirth: string | null;
  address: string | null;
  enrolledAt: string;
  classAssignments: ClassAssignment[];
  guardians: { name: string; phone: string | null }[];
  studentCategory: { id: string; name: string } | null;
};

type Category = { id: string; name: string };

function getAge(dateOfBirth: string): number {
  const today = new Date();
  const dob   = new Date(dateOfBirth);
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

type GradeLevel = { id: string; name: string; sequence: number };
type ClassItem   = { id: string; name: string; gradeLevelId: string };

type AddForm = {
  firstName: string;
  lastName: string;
  gender: string;
  dateOfBirth: string;
  classId: string;
  studentCategoryId: string;
};

const EMPTY_FORM: AddForm = { firstName: '', lastName: '', gender: '', dateOfBirth: '', classId: '', studentCategoryId: '' };

// ── Avatar ────────────────────────────────────────────────────────────────────

function StudentAvatar({ student }: { student: StudentListItem }) {
  const initials = `${student.firstName[0]}${student.lastName[0]}`;
  const colors   = ['#065f46','#1e40af','#6d28d9','#b45309','#0f766e','#be185d'];
  const color    = colors[student.studentId.charCodeAt(student.studentId.length - 1) % colors.length];
  return (
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
      style={{ backgroundColor: color }}
    >
      {initials}
    </div>
  );
}

// ── Field / Input helpers (inline — no settings-card dependency) ──────────────

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1.5">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls = 'w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 outline-none focus:border-transparent transition';

function FocusInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(inputCls, props.className)}
      onFocus={e => { e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'; props.onFocus?.(e); }}
      onBlur={e => { e.currentTarget.style.boxShadow = ''; props.onBlur?.(e); }}
    />
  );
}

function FocusSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(inputCls, props.className)}
      onFocus={e => { e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'; props.onFocus?.(e); }}
      onBlur={e => { e.currentTarget.style.boxShadow = ''; props.onBlur?.(e); }}
    />
  );
}

// ── Add Student Dialog ────────────────────────────────────────────────────────

function AddStudentDialog({ open, onCreated, onClose, classes, classesLoading }: {
  open: boolean;
  onCreated: () => void;
  onClose: () => void;
  classes: ClassItem[] | null;
  classesLoading: boolean;
}) {
  const [form, setForm]     = useState<AddForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [created, setCreated] = useState<{ studentId: string; firstName: string; lastName: string; tempPassword: string } | null>(null);

  const fetchCategories = useCallback(() => staffApi.get<{ id: string; name: string }[]>('/school/student-categories'), []);
  const { data: categories } = useApi(fetchCategories);

  function set(k: keyof AddForm, v: string) {
    setForm(f => ({ ...f, [k]: v }));
  }

  function handleClose() {
    setForm(EMPTY_FORM);
    setError(null);
    setCreated(null);
    onClose();
  }

  async function save() {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError('First name and last name are required.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const result = await staffApi.post<{ studentId: string; firstName: string; lastName: string; tempPassword: string }>(
        '/school/students',
        {
          firstName:   form.firstName.trim(),
          lastName:    form.lastName.trim(),
          gender:      form.gender      || undefined,
          dateOfBirth: form.dateOfBirth || undefined,
          classId:     form.classId     || undefined,
          studentCategoryId: form.studentCategoryId || undefined,
        },
      );
      setCreated(result);
      onCreated();
    } catch (err) {
      setError((err as ApiError).message ?? 'Failed to create student.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Add new student" width="max-w-lg">
      {created ? (
        /* ── Success state ── */
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
              style={{ backgroundColor: 'var(--accent)' }}>
              ✓
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">
                {created.firstName} {created.lastName} added successfully
              </p>
              <p className="text-xs text-slate-500">
                Student ID: <span className="font-mono font-medium">{created.studentId}</span>
              </p>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">Temporary portal password</p>
            <p className="font-mono text-amber-900 text-lg tracking-widest">{created.tempPassword}</p>
            <p className="text-xs text-amber-600 mt-1.5">
              Share this with the student or guardian. They will be prompted to change it on first login.
            </p>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              onClick={() => { setForm(EMPTY_FORM); setCreated(null); }}
              className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
            >
              Add another
            </button>
            <button
              onClick={handleClose}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        /* ── Form state ── */
        <div className="space-y-4">
          {error && (
            <div className="px-3.5 py-2.5 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="First name" required>
              <FocusInput
                value={form.firstName}
                onChange={e => set('firstName', e.target.value)}
                placeholder="e.g. Ama"
                onKeyDown={e => e.key === 'Enter' && save()}
              />
            </Field>
            <Field label="Last name" required>
              <FocusInput
                value={form.lastName}
                onChange={e => set('lastName', e.target.value)}
                placeholder="e.g. Mensah"
                onKeyDown={e => e.key === 'Enter' && save()}
              />
            </Field>
            <Field label="Gender">
              <FocusSelect value={form.gender} onChange={e => set('gender', e.target.value)}>
                <option value="">Not specified</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </FocusSelect>
            </Field>
            <Field label="Date of birth">
              <FocusInput type="date" value={form.dateOfBirth} onChange={e => set('dateOfBirth', e.target.value)} />
            </Field>
            <div className="col-span-2">
              <Field label="Assign to class">
                {classesLoading ? (
                  <div className="h-9 bg-slate-100 rounded-lg animate-pulse" />
                ) : classes && classes.length > 0 ? (
                  <FocusSelect value={form.classId} onChange={e => set('classId', e.target.value)}>
                    <option value="">No class yet</option>
                    {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </FocusSelect>
                ) : (
                  <p className="text-xs text-slate-400 pt-1">
                    No classes found.{' '}
                    <a href="/school/settings/grade-structure" className="underline underline-offset-2" style={{ color: 'var(--accent)' }}>
                      Set up grade structure
                    </a>{' '}
                    first.
                  </p>
                )}
              </Field>
            </div>
            <div className="col-span-2">
              <Field label="Fee category">
                {categories && categories.length > 0 ? (
                  <FocusSelect value={form.studentCategoryId} onChange={e => set('studentCategoryId', e.target.value)}>
                    <option value="">Not assigned</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </FocusSelect>
                ) : (
                  <p className="text-xs text-slate-400 pt-1">
                    No categories yet.{' '}
                    <a href="/school/settings/student-categories" className="underline underline-offset-2" style={{ color: 'var(--accent)' }}>
                      Set up student categories
                    </a>{' '}
                    first.
                  </p>
                )}
              </Field>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button
              onClick={handleClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60 transition"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              {saving ? 'Creating…' : 'Create student'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function StudentsPage() {
  const router = useRouter();
  const scope  = useTeacherScope();

  const [search, setSearch]           = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showAdd, setShowAdd]         = useState(false);

  // Bulk fee-category assignment (owner/admin only)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkCategoryId, setBulkCategoryId] = useState('');
  const [bulkSaving, setBulkSaving]   = useState(false);
  const [bulkMsg, setBulkMsg]         = useState<string | null>(null);

  const fetchStudents = useCallback(() => {
    const params = new URLSearchParams();
    if (classFilter)    params.set('classId', classFilter);
    if (categoryFilter) params.set('studentCategoryId', categoryFilter);
    const qs = params.toString();
    return staffApi.get<StudentListItem[]>(`/school/students${qs ? `?${qs}` : ''}`);
  }, [classFilter, categoryFilter]);
  const fetchCategories = useCallback(() => staffApi.get<Category[]>('/school/student-categories'), []);
  const fetchGrades  = useCallback(() => staffApi.get<GradeLevel[]>('/school/grade-structure/grade-levels'), []);
  const fetchClasses = useCallback(async () => {
    const list = await staffApi.get<ClassItem[]>('/school/grade-structure/classes');
    if (list.length === 0) {
      await staffApi.post('/school/grade-structure/classes/ensure', {}).catch(() => {});
      return staffApi.get<ClassItem[]>('/school/grade-structure/classes');
    }
    return list;
  }, []);

  const { data: students, loading, refetch }        = useApi(fetchStudents, `${classFilter}|${categoryFilter}`);
  const { data: categories }                        = useApi(fetchCategories);
  const { data: grades }                            = useApi(fetchGrades);
  const { data: classes, loading: classesLoading }  = useApi(fetchClasses);

  const selectable = !scope.restricted;
  const colCount   = 8 + (selectable ? 1 : 0);  // data cols + optional checkbox col

  // For restricted teachers: only show their assigned classes
  const visibleClasses = scope.restricted
    ? (classes ?? []).filter(c => scope.assignedClassIds.includes(c.id))
    : (gradeFilter ? (classes ?? []).filter(c => c.gradeLevelId === gradeFilter) : (classes ?? []));

  // Restricted teachers are already scoped to their classes by the backend
  // (studentScopeFilter), so we only apply the local search filter here. Re-
  // filtering on the client by `classAssignments[0]` (the latest assignment)
  // would wrongly drop students who match on an earlier assignment.
  const filtered = (students ?? []).filter(s => {
    if (!search) return true;
    return `${s.firstName} ${s.lastName} ${s.studentId}`.toLowerCase().includes(search.toLowerCase());
  });

  const currentClass = (s: StudentListItem) => s.classAssignments[0]?.class;

  // ── Bulk selection ──────────────────────────────────────────────────────────
  // Clear selection whenever the visible set changes via filters/search.
  useEffect(() => { setSelectedIds(new Set()); setBulkMsg(null); }, [classFilter, categoryFilter, gradeFilter, search]);

  const visibleIds      = filtered.map(s => s.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));

  function toggleOne(id: string) {
    setBulkMsg(null);
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setBulkMsg(null);
    setSelectedIds(prev => (visibleIds.every(id => prev.has(id)) ? new Set() : new Set(visibleIds)));
  }

  async function bulkAssign() {
    if (selectedIds.size === 0) return;
    setBulkSaving(true); setBulkMsg(null);
    try {
      const res = await staffApi.post<{ updated: number }>('/school/students/bulk-category', {
        studentIds: Array.from(selectedIds),
        studentCategoryId: bulkCategoryId,  // '' clears the category
      });
      const catName = categories?.find(c => c.id === bulkCategoryId)?.name;
      setBulkMsg(`${res.updated} student${res.updated !== 1 ? 's' : ''} ${bulkCategoryId ? `set to ${catName}` : 'category cleared'}.`);
      setSelectedIds(new Set());
      refetch();
    } catch (err) {
      setBulkMsg((err as ApiError).message ?? 'Failed to update students.');
    } finally {
      setBulkSaving(false);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Students</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {students ? `${filtered.length} student${filtered.length !== 1 ? 's' : ''}` : 'Loading…'}
          </p>
        </div>
        {/* Only owner/admin can add students */}
        {!scope.restricted && (
          <button
            onClick={() => setShowAdd(v => !v)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add student
          </button>
        )}
      </div>

      <AddStudentDialog
        open={showAdd}
        onCreated={() => refetch()}
        onClose={() => setShowAdd(false)}
        classes={classes ?? null}
        classesLoading={classesLoading}
      />

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or ID…"
          className="w-64 px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 outline-none"
          onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
          onBlur={e => e.currentTarget.style.boxShadow = ''}
        />
        {/* Grade level filter — hide for restricted teachers (their scope is class-based) */}
        {!scope.restricted && (
          <select
            value={gradeFilter}
            onChange={e => { setGradeFilter(e.target.value); setClassFilter(''); }}
            className="px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none"
            onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
            onBlur={e => e.currentTarget.style.boxShadow = ''}
          >
            <option value="">All grade levels</option>
            {grades?.sort((a,b) => a.sequence - b.sequence).map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        )}
        <select
          value={classFilter}
          onChange={e => setClassFilter(e.target.value)}
          className="px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none"
          onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
          onBlur={e => e.currentTarget.style.boxShadow = ''}
        >
          <option value="">{scope.restricted ? 'All my classes' : 'All classes'}</option>
          {visibleClasses.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        {/* Fee category filter — hidden for restricted teachers */}
        {!scope.restricted && (
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none"
            onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
            onBlur={e => e.currentTarget.style.boxShadow = ''}
          >
            <option value="">All categories</option>
            {categories?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value="none">No category</option>
          </select>
        )}
        {(search || classFilter || gradeFilter || categoryFilter) && (
          <button
            onClick={() => { setSearch(''); setClassFilter(''); setGradeFilter(''); setCategoryFilter(''); }}
            className="text-sm text-slate-400 hover:text-slate-700 transition"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Bulk fee-category assignment bar */}
      {selectable && selectedIds.size > 0 && (
        <div className="flex items-center gap-3 mb-4 px-4 py-3 rounded-xl border flex-wrap"
          style={{ borderColor: 'var(--accent)', backgroundColor: 'var(--accent-tint, #f0fdf4)' }}>
          <span className="text-sm font-medium text-slate-700">
            {selectedIds.size} selected
          </span>
          <span className="text-slate-300">·</span>
          <span className="text-sm text-slate-500">Set fee category:</span>
          <select
            value={bulkCategoryId}
            onChange={e => setBulkCategoryId(e.target.value)}
            className="px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none"
          >
            <option value="">— Remove category —</option>
            {categories?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button
            onClick={bulkAssign}
            disabled={bulkSaving}
            className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white transition disabled:opacity-50"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            {bulkSaving ? 'Applying…' : `Apply to ${selectedIds.size}`}
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-sm text-slate-400 hover:text-slate-700 transition ml-auto"
          >
            Clear selection
          </button>
        </div>
      )}
      {bulkMsg && (
        <p className="mb-4 text-sm text-emerald-600">{bulkMsg}</p>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              {selectable && (
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAll}
                    className="w-4 h-4 rounded cursor-pointer"
                    aria-label="Select all students"
                  />
                </th>
              )}
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Student</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">ID</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Class</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Category</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Date of birth</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide hidden lg:table-cell">Guardian</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide hidden md:table-cell">Address</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide hidden xl:table-cell">Enrolled</th>
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 8 }).map((_, i) => (
              <tr key={i} className="border-b border-slate-50">
                <td colSpan={colCount} className="px-4 py-3.5">
                  <div className="h-8 bg-slate-100 rounded-lg animate-pulse" />
                </td>
              </tr>
            ))}

            {!loading && filtered?.map(student => {
              const cls = currentClass(student);
              const guardian = student.guardians?.[0];
              const selected = selectedIds.has(student.id);
              return (
                <tr
                  key={student.id}
                  className={cn(
                    'border-b border-slate-50 hover:bg-slate-50/60 transition cursor-pointer',
                    selected && 'bg-slate-50/80',
                  )}
                  onClick={() => router.push(`/school/students/${student.id}`)}
                >
                  {selectable && (
                    <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleOne(student.id)}
                        className="w-4 h-4 rounded cursor-pointer"
                        aria-label={`Select ${student.firstName} ${student.lastName}`}
                      />
                    </td>
                  )}
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <StudentAvatar student={student} />
                      <span className="text-sm font-medium text-slate-800">
                        {student.lastName}, {student.firstName}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-xs font-mono text-slate-500">{student.studentId}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    {cls ? (
                      <div>
                        <p className="text-sm text-slate-700">{cls.name}</p>
                        <p className="text-xs text-slate-400">{cls.gradeLevel.name}</p>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-300 italic">Unassigned</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    {student.studentCategory ? (
                      <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        {student.studentCategory.name}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-300 italic">None</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    {student.dateOfBirth ? (
                      <div>
                        <p className="text-sm text-slate-600">{formatDate(student.dateOfBirth)}</p>
                        <p className="text-xs text-slate-400">{getAge(student.dateOfBirth)} yrs</p>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 hidden lg:table-cell">
                    {guardian ? (
                      <div>
                        <p className="text-sm text-slate-600">{guardian.name}</p>
                        {guardian.phone && <p className="text-xs text-slate-400">{guardian.phone}</p>}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 hidden md:table-cell max-w-[200px]">
                    {student.address ? (
                      <span className="text-sm text-slate-500 block truncate" title={student.address}>{student.address}</span>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 hidden xl:table-cell whitespace-nowrap">
                    <span className="text-sm text-slate-500">{formatDate(student.enrolledAt)}</span>
                  </td>
                </tr>
              );
            })}

            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={colCount} className="px-4 py-16 text-center">
                  <p className="text-sm text-slate-400">
                    {search || classFilter || gradeFilter
                      ? 'No students match your filters.'
                      : scope.restricted
                        ? 'No students found in your assigned classes.'
                        : 'No students yet.'}
                  </p>
                  {!search && !classFilter && !gradeFilter && !scope.restricted && (
                    <button
                      onClick={() => setShowAdd(true)}
                      className="mt-3 text-sm font-medium underline underline-offset-2"
                      style={{ color: 'var(--accent)' }}
                    >
                      Add your first student
                    </button>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
