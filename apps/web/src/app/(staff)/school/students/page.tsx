'use client';

import { useState, useCallback } from 'react';
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
  enrolledAt: string;
  classAssignments: ClassAssignment[];
};

type GradeLevel = { id: string; name: string; sequence: number };
type ClassItem   = { id: string; name: string; gradeLevelId: string };

type AddForm = {
  firstName: string;
  lastName: string;
  gender: string;
  dateOfBirth: string;
  classId: string;
};

const EMPTY_FORM: AddForm = { firstName: '', lastName: '', gender: '', dateOfBirth: '', classId: '' };

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

          <div className="grid grid-cols-2 gap-4">
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
  const [showAdd, setShowAdd]         = useState(false);

  const fetchStudents = useCallback(
    () => staffApi.get<StudentListItem[]>(`/school/students${classFilter ? `?classId=${classFilter}` : ''}`),
    [classFilter],
  );
  const fetchGrades  = useCallback(() => staffApi.get<GradeLevel[]>('/school/grade-structure/grade-levels'), []);
  const fetchClasses = useCallback(async () => {
    const list = await staffApi.get<ClassItem[]>('/school/grade-structure/classes');
    if (list.length === 0) {
      await staffApi.post('/school/grade-structure/classes/ensure', {}).catch(() => {});
      return staffApi.get<ClassItem[]>('/school/grade-structure/classes');
    }
    return list;
  }, []);

  const { data: students, loading, refetch }        = useApi(fetchStudents, classFilter);
  const { data: grades }                            = useApi(fetchGrades);
  const { data: classes, loading: classesLoading }  = useApi(fetchClasses);

  // For restricted teachers: only show their assigned classes
  const visibleClasses = scope.restricted
    ? (classes ?? []).filter(c => scope.assignedClassIds.includes(c.id))
    : (gradeFilter ? (classes ?? []).filter(c => c.gradeLevelId === gradeFilter) : (classes ?? []));

  // For restricted teachers: further filter students to their scoped classes
  const filtered = (students ?? []).filter(s => {
    if (scope.restricted) {
      const studentClassId = s.classAssignments[0]?.class?.id;
      if (studentClassId && !scope.assignedClassIds.includes(studentClassId)) return false;
    }
    if (!search) return true;
    return `${s.firstName} ${s.lastName} ${s.studentId}`.toLowerCase().includes(search.toLowerCase());
  });

  const currentClass = (s: StudentListItem) => s.classAssignments[0]?.class;

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
        {(search || classFilter || gradeFilter) && (
          <button
            onClick={() => { setSearch(''); setClassFilter(''); setGradeFilter(''); }}
            className="text-sm text-slate-400 hover:text-slate-700 transition"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Student</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">ID</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Class</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Gender</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Enrolled</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 8 }).map((_, i) => (
              <tr key={i} className="border-b border-slate-50">
                <td colSpan={6} className="px-4 py-3.5">
                  <div className="h-8 bg-slate-100 rounded-lg animate-pulse" />
                </td>
              </tr>
            ))}

            {!loading && filtered?.map(student => {
              const cls = currentClass(student);
              return (
                <tr
                  key={student.id}
                  className="border-b border-slate-50 hover:bg-slate-50/60 transition cursor-pointer"
                  onClick={() => router.push(`/school/students/${student.id}`)}
                >
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
                    <span className="text-sm text-slate-600">{student.gender ?? '—'}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-sm text-slate-500">
                      {new Date(student.enrolledAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <span className="text-xs font-medium" style={{ color: 'var(--accent)' }}>View →</span>
                  </td>
                </tr>
              );
            })}

            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-16 text-center">
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
  );
}
