'use client';

import { useState, useCallback, useMemo, use } from 'react';
import { useRouter } from 'next/navigation';
import { staffApi, type ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { FormField, Input, SaveButton, Alert } from '@/components/ui/settings-card';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/cn';
import { useStaffAuth } from '@/contexts/staff-auth';
import { InvoicePreviewModal, type InvoicePreviewData } from '@/components/finance/invoice-preview-modal';

// ── Types ─────────────────────────────────────────────────────────────────────

type Guardian = {
  id: string;
  name: string;
  relationship: string;
  phone: string | null;
  email: string | null;
  isPrimary: boolean;
};

type ClassAssignment = {
  id: string;
  assignedAt: string;
  class: { id: string; name: string; gradeLevel: { id: string; name: string } };
  academicYear: { id: string; name: string };
};

type Student = {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  gender: string | null;
  phone: string | null;
  address: string | null;
  medicalNotes: string | null;
  studentCategory: { id: string; name: string } | null;
  customFields: Record<string, unknown> | null;
  enrolledAt: string;
  guardians: Guardian[];
  classAssignments: ClassAssignment[];
  portalCredential: { mustChange: boolean; tempPassword: string | null; updatedAt: string } | null;
  transportAssignment: {
    transportRoute: { id: string; name: string; dailyRate: number };
  } | null;
};

type PerformanceTerm = {
  academicYear: string;
  term: string;
  class: string;
  gradeLevel: string;
  percentage: number | null;
  attendanceRate: number | null;
  assessmentCount: number;
};

type PerformanceData = {
  history: PerformanceTerm[];
  declining: boolean;
  termsTracked: number;
};

type BillingFrequency = 'PER_TERM' | 'PER_YEAR' | 'ONE_TIME';
type FeeComponent = { id: string; name: string; sequence: number; billingFrequency: BillingFrequency };
type FeeItem = { feeComponentId: string; defaultAmount: number; overrides: { gradeLevelId: string; amount: number }[] };

const FREQ_LABEL: Record<BillingFrequency, string> = {
  PER_TERM: 'Every term', PER_YEAR: 'Once a year', ONE_TIME: 'One-time',
};

const TABS = ['Profile', 'Guardians', 'Academic History', 'Performance'] as const;
type Tab = typeof TABS[number];

// ── Profile tab ───────────────────────────────────────────────────────────────

function ProfileTab({ student, onSaved }: { student: Student; onSaved: () => void }) {
  const [form, setForm] = useState({
    firstName:   student.firstName,
    lastName:    student.lastName,
    dateOfBirth: student.dateOfBirth ? student.dateOfBirth.split('T')[0] : '',
    gender:      student.gender      ?? '',
    phone:       student.phone       ?? '',
    address:     student.address     ?? '',
    medicalNotes: student.medicalNotes ?? '',
    studentCategoryId: student.studentCategory?.id ?? '',
  });
  const [saving, setSaving]     = useState(false);
  const [resetting, setResetting] = useState(false);
  const [alert, setAlert]       = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  // Class assignment
  const fetchClasses = useCallback(() => staffApi.get<{ id: string; name: string }[]>('/school/grade-structure/classes'), []);
  const { data: classes } = useApi(fetchClasses);

  // Fee category — determines which fee structure applies when invoices are generated
  const fetchCategories = useCallback(() => staffApi.get<{ id: string; name: string }[]>('/school/student-categories'), []);
  const { data: categories } = useApi(fetchCategories);
  const [newClassId, setNewClassId] = useState('');
  const [assigningClass, setAssigningClass] = useState(false);

  function f(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(v => ({ ...v, [field]: e.target.value }));
  }

  async function save() {
    setAlert(null); setSaving(true);
    try {
      await staffApi.patch(`/school/students/${student.id}`, {
        firstName:    form.firstName,
        lastName:     form.lastName,
        dateOfBirth:  form.dateOfBirth  || null,
        gender:       form.gender       || null,
        phone:        form.phone        || null,
        address:      form.address      || null,
        medicalNotes: form.medicalNotes || null,
        studentCategoryId: form.studentCategoryId,
      });
      setAlert({ type: 'success', message: 'Profile saved.' });
      onSaved();
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Failed to save.' });
    } finally {
      setSaving(false);
    }
  }

  async function assignClass() {
    if (!newClassId) return;
    setAssigningClass(true);
    try {
      await staffApi.post(`/school/students/${student.id}/class-assignment`, { classId: newClassId });
      setNewClassId('');
      onSaved();
    } finally {
      setAssigningClass(false);
    }
  }

  async function resetPortalPassword() {
    setResetting(true);
    try {
      const res = await staffApi.patch<{ tempPassword?: string }>(`/school/students/${student.id}/reset-portal-password`);
      setAlert({ type: 'success', message: `Portal password reset. Temporary password: ${res.tempPassword ?? '(sent)'}` });
    } finally {
      setResetting(false);
    }
  }

  const currentClass = student.classAssignments[0];

  return (
    <div className="space-y-6">
      {alert && <Alert type={alert.type} message={alert.message} />}

      {/* Personal info */}
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField label="First name" required>
            <Input value={form.firstName} onChange={f('firstName')} />
          </FormField>
          <FormField label="Last name" required>
            <Input value={form.lastName} onChange={f('lastName')} />
          </FormField>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <FormField label="Date of birth">
            <Input type="date" value={form.dateOfBirth} onChange={f('dateOfBirth')} />
          </FormField>
          <FormField label="Gender">
            <select value={form.gender} onChange={f('gender')}
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 outline-none">
              <option value="">Not specified</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </FormField>
          <FormField label="Phone">
            <Input value={form.phone} onChange={f('phone')} placeholder="+233 20 000 0000" />
          </FormField>
        </div>
        <FormField label="Address">
          <Input value={form.address} onChange={f('address')} />
        </FormField>
        <FormField label="Fee category">
          {categories && categories.length > 0 ? (
            <>
              <select value={form.studentCategoryId} onChange={f('studentCategoryId')}
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 outline-none">
                <option value="">Not assigned</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <p className="text-xs text-slate-400 mt-1">Determines which fee structure applies when invoices are generated.</p>
            </>
          ) : (
            <p className="text-xs text-slate-400 pt-1">
              No categories yet.{' '}
              <a href="/school/settings/student-categories" className="underline underline-offset-2" style={{ color: 'var(--accent)' }}>
                Set up student categories
              </a>{' '}
              first.
            </p>
          )}
        </FormField>
        <FormField label="Medical notes">
          <textarea
            value={form.medicalNotes}
            onChange={f('medicalNotes')}
            rows={2}
            placeholder="Allergies, conditions, medications…"
            className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 outline-none resize-none"
            onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
            onBlur={e => e.currentTarget.style.boxShadow = ''}
          />
        </FormField>
        <div className="flex justify-end">
          <SaveButton loading={saving} onClick={save} />
        </div>
      </div>

      {/* Class assignment */}
      <div className="pt-5 border-t border-slate-100">
        <p className="text-sm font-semibold text-slate-700 mb-3">Class assignment</p>
        {currentClass ? (
          <div className="flex items-center gap-3 mb-3">
            <div className="px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-700">
              <span className="font-medium">{currentClass.class.name}</span>
              <span className="text-slate-400 ml-2">· {currentClass.academicYear.name}</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-400 mb-3 italic">Not assigned to a class yet.</p>
        )}
        <div className="flex gap-2">
          <select value={newClassId} onChange={e => setNewClassId(e.target.value)}
            className="flex-1 max-w-xs px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none">
            <option value="">Select class…</option>
            {classes?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <SaveButton loading={assigningClass} onClick={assignClass} label="Assign" disabled={!newClassId} />
        </div>
      </div>

      {/* Portal credentials */}
      <div className="pt-5 border-t border-slate-100">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold text-slate-700">Student portal access</p>
          <button
            onClick={resetPortalPassword}
            disabled={resetting}
            className="text-sm font-medium px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition disabled:opacity-40"
          >
            {resetting ? 'Resetting…' : 'Reset password'}
          </button>
        </div>
        <p className="text-xs text-slate-400">
          Login ID: <span className="font-mono font-medium text-slate-600">{student.studentId}</span>
        </p>
        {student.portalCredential?.mustChange && student.portalCredential?.tempPassword && (
          <div className="mt-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">
              Temporary password — not yet changed
            </p>
            <p className="font-mono text-amber-900 text-lg tracking-widest">
              {student.portalCredential.tempPassword}
            </p>
            <p className="text-xs text-amber-600 mt-1">
              Share with the student or guardian. This clears once they log in and set a new password.
            </p>
          </div>
        )}
        {student.portalCredential?.mustChange && !student.portalCredential?.tempPassword && (
          <p className="text-xs text-amber-500 mt-1">· Password change required on next login</p>
        )}
      </div>

      {/* Transport */}
      {student.transportAssignment && (
        <div className="pt-5 border-t border-slate-100">
          <p className="text-sm font-semibold text-slate-700 mb-1">Transport</p>
          <p className="text-sm text-slate-600">
            Route: <span className="font-medium">{student.transportAssignment.transportRoute.name}</span>
            <span className="text-slate-400 ml-2">· GHS {student.transportAssignment.transportRoute.dailyRate}/day</span>
          </p>
        </div>
      )}
    </div>
  );
}

// ── Guardians tab ─────────────────────────────────────────────────────────────

function GuardiansTab({ student, onSaved }: { student: Student; onSaved: () => void }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', relationship: '', phone: '', email: '', isPrimary: false });
  const [saving, setSaving]   = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [alert, setAlert]     = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  async function add() {
    if (!form.name || !form.relationship) {
      setAlert({ type: 'error', message: 'Name and relationship are required.' }); return;
    }
    setAlert(null); setSaving(true);
    try {
      await staffApi.post(`/school/students/${student.id}/guardians`, form);
      setForm({ name: '', relationship: '', phone: '', email: '', isPrimary: false });
      setShowAdd(false);
      onSaved();
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Failed to add guardian.' });
    } finally {
      setSaving(false);
    }
  }

  async function remove(guardianId: string) {
    setRemoving(guardianId);
    try {
      await staffApi.delete(`/school/students/${student.id}/guardians/${guardianId}`);
      onSaved();
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} message={alert.message} />}

      {/* Guardian list */}
      {student.guardians.length === 0 && (
        <p className="text-sm text-slate-400 italic py-4 text-center">No guardians added yet.</p>
      )}

      <div className="space-y-3">
        {student.guardians.map(g => (
          <div key={g.id} className={`border rounded-xl px-4 py-3.5 ${g.isPrimary ? '' : 'border-slate-100'}`}
            style={g.isPrimary ? { borderColor: 'var(--accent)', backgroundColor: 'var(--accent-tint)' } : {}}>
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-semibold text-slate-800">{g.name}</p>
                  {g.isPrimary && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: 'var(--accent)' }}>
                      Primary
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 capitalize">{g.relationship}</p>
                {g.phone && <p className="text-xs text-slate-500 mt-0.5">{g.phone}</p>}
                {g.email && <p className="text-xs text-slate-500">{g.email}</p>}
              </div>
              <button
                onClick={() => remove(g.id)}
                disabled={removing === g.id}
                className="text-slate-300 hover:text-red-400 transition text-lg disabled:opacity-40"
              >
                {removing === g.id ? '…' : '×'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add guardian */}
      {!showAdd ? (
        <button
          onClick={() => setShowAdd(true)}
          className="w-full py-2.5 border border-dashed border-slate-300 rounded-xl text-sm text-slate-400 hover:border-slate-400 hover:text-slate-600 transition"
        >
          + Add guardian
        </button>
      ) : (
        <div className="border border-slate-200 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-slate-700">Add guardian</p>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Full name" required>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ama Mensah" />
            </FormField>
            <FormField label="Relationship" required>
              <select value={form.relationship} onChange={e => setForm(f => ({ ...f, relationship: e.target.value }))}
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 outline-none">
                <option value="">Select…</option>
                {['Mother','Father','Guardian','Grandmother','Grandfather','Uncle','Aunt','Sibling','Other'].map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Phone">
              <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+233 20 000 0000" />
            </FormField>
            <FormField label="Email">
              <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="parent@email.com" />
            </FormField>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.isPrimary} onChange={e => setForm(f => ({ ...f, isPrimary: e.target.checked }))} className="w-4 h-4 rounded" />
            <span className="text-sm text-slate-700">Primary guardian</span>
          </label>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAdd(false)} className="text-sm text-slate-400 hover:text-slate-600 transition">Cancel</button>
            <SaveButton loading={saving} onClick={add} label="Add guardian" />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Academic History tab ──────────────────────────────────────────────────────

function AcademicHistoryTab({ student }: { student: Student }) {
  const sorted = [...student.classAssignments].sort(
    (a, b) => new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime(),
  );

  return (
    <div>
      {sorted.length === 0 && (
        <p className="text-sm text-slate-400 italic text-center py-8">No class assignments recorded.</p>
      )}
      <div className="space-y-2">
        {sorted.map((a, i) => (
          <div key={a.id} className="flex items-center gap-4 py-3 border-b border-slate-50 last:border-0">
            {/* Timeline indicator */}
            <div className="flex flex-col items-center w-6 shrink-0">
              <div className={`w-2.5 h-2.5 rounded-full ${i === 0 ? '' : 'bg-slate-200'}`}
                style={i === 0 ? { backgroundColor: 'var(--accent)' } : {}} />
              {i < sorted.length - 1 && <div className="w-px flex-1 bg-slate-100 mt-1 h-6" />}
            </div>

            {/* Info */}
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-800">{a.class.name}</p>
              <p className="text-xs text-slate-400">{a.class.gradeLevel.name} · {a.academicYear.name}</p>
            </div>

            {/* Date */}
            <p className="text-xs text-slate-400 shrink-0">
              {new Date(a.assignedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>

            {i === 0 && (
              <span className="text-xs font-medium px-2.5 py-0.5 rounded-full text-white shrink-0" style={{ backgroundColor: 'var(--accent)' }}>
                Current
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Performance tab ───────────────────────────────────────────────────────────

function PerformanceTab({ studentId }: { studentId: string }) {
  const fetchPerf = useCallback(
    () => staffApi.get<PerformanceData>(`/school/reports/performance/${studentId}`),
    [studentId],
  );
  const { data, loading } = useApi(fetchPerf);

  if (loading) return (
    <div className="space-y-3">
      {[1,2,3].map(i => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}
    </div>
  );

  const history = data?.history ?? [];

  if (history.length === 0) return (
    <p className="text-sm text-slate-400 italic text-center py-8">No performance data yet.</p>
  );

  // Group by academic year
  const byYear = history.reduce<Record<string, PerformanceTerm[]>>((acc, t) => {
    if (!acc[t.academicYear]) acc[t.academicYear] = [];
    acc[t.academicYear].push(t);
    return acc;
  }, {});

  function scoreColor(score: number | null) {
    if (score === null) return '#94a3b8';
    if (score >= 70)  return '#22c55e';
    if (score >= 50)  return '#f59e0b';
    return '#ef4444';
  }

  function attendanceColor(rate: number | null) {
    if (rate === null) return '#94a3b8';
    if (rate >= 80)  return '#22c55e';
    if (rate >= 60)  return '#f59e0b';
    return '#ef4444';
  }

  return (
    <div className="space-y-6">
      {Object.entries(byYear).reverse().map(([year, terms]) => (
        <div key={year}>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">{year}</p>
          <div className="space-y-2">
            {terms.map((term, i) => (
              <div key={i} className="flex items-center gap-4 py-3 px-4 bg-slate-50 rounded-xl">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-800">{term.term}</p>
                  <p className="text-xs text-slate-400">{term.class} · {term.gradeLevel}</p>
                </div>

                {/* Academic score */}
                <div className="text-center min-w-[80px]">
                  <p className="text-xs text-slate-400 mb-0.5">Avg score</p>
                  <p className="text-lg font-bold" style={{ color: scoreColor(term.percentage) }}>
                    {term.percentage !== null ? `${term.percentage}%` : '—'}
                  </p>
                </div>

                {/* Attendance */}
                <div className="text-center min-w-[80px]">
                  <p className="text-xs text-slate-400 mb-0.5">Attendance</p>
                  <p className="text-lg font-bold" style={{ color: attendanceColor(term.attendanceRate) }}>
                    {term.attendanceRate !== null ? `${term.attendanceRate}%` : '—'}
                  </p>
                </div>

                {/* Mini bar — score */}
                <div className="w-24 hidden lg:block">
                  <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    {term.percentage !== null && (
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${term.percentage}%`, backgroundColor: scoreColor(term.percentage) }}
                      />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Trend note from API */}
      {data?.declining && (
        <div className="px-4 py-3 rounded-xl text-sm font-medium bg-red-50 text-red-600">
          ↓ Declining trend over the last 3 terms. Consider intervention.
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router  = useRouter();
  const { user } = useStaffAuth();
  const [tab, setTab] = useState<Tab>('Profile');
  const [previewOpen, setPreviewOpen] = useState(false);

  const fetchStudent = useCallback(() => staffApi.get<Student>(`/school/students/${id}`), [id]);
  const { data: student, loading, refetch } = useApi(fetchStudent);

  // ── Bill preview — built from the current Fee Setup for this student's
  // category + grade (same computation as invoice generation). ──────────────────
  const categoryId = student?.studentCategory?.id ?? '';
  const fetchComponents = useCallback(() => staffApi.get<FeeComponent[]>('/school/finance/fee-components'), []);
  const fetchFeeItems = useCallback(() => {
    if (!categoryId) return Promise.resolve([] as FeeItem[]);
    return staffApi.get<FeeItem[]>(`/school/finance/fee-items?studentCategoryId=${categoryId}`);
  }, [categoryId]);
  const { data: components } = useApi(fetchComponents);
  const { data: feeItems }   = useApi(fetchFeeItems, categoryId);

  const billPreview: InvoicePreviewData | null = useMemo(() => {
    if (!student) return null;
    const assignment = student.classAssignments[0];
    const gradeId = assignment?.class.gradeLevel.id;
    const lines = (components ?? [])
      .slice()
      .sort((a, b) => a.sequence - b.sequence)
      .map(c => {
        const item = feeItems?.find(i => i.feeComponentId === c.id);
        if (!item) return null;
        const ov = gradeId ? item.overrides.find(o => o.gradeLevelId === gradeId) : undefined;
        const amount = ov && ov.amount > 0 ? ov.amount : item.defaultAmount;
        const tag = c.billingFrequency !== 'PER_TERM' ? FREQ_LABEL[c.billingFrequency] : undefined;
        return amount > 0 ? { name: c.name, amount, tag } : null;
      })
      .filter((l): l is NonNullable<typeof l> => !!l);
    const primary = student.guardians.find(g => g.isPrimary) ?? student.guardians[0];
    return {
      className: assignment?.class.name ?? '—',
      lines,
      student: {
        name: `${student.firstName} ${student.lastName}`,
        studentId: student.studentId,
        guardianName: primary?.name ?? null,
      },
      issuedBy: user ? `${user.firstName} ${user.lastName}`.trim() : null,
    };
  }, [student, components, feeItems, user]);

  if (loading) return (
    <div className="space-y-4">
      <div className="h-24 bg-slate-100 rounded-2xl animate-pulse" />
      <div className="h-72 bg-slate-100 rounded-2xl animate-pulse" />
    </div>
  );

  if (!student) return <p className="text-sm text-slate-400">Student not found.</p>;

  const currentAssignment = student.classAssignments[0];

  return (
    <div>
      {/* Back */}
      <button onClick={() => router.push('/school/students')}
        className="text-sm text-slate-400 hover:text-slate-700 transition mb-5 flex items-center gap-1">
        ← Back to students
      </button>

      {/* Student header */}
      <div className="flex items-center gap-5 mb-6">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold shrink-0"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          {student.firstName[0]}{student.lastName[0]}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-slate-900">
            {student.firstName} {student.lastName}
          </h1>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="text-xs font-mono text-slate-500">{student.studentId}</span>
            {currentAssignment && (
              <span
                className="text-xs font-medium px-2.5 py-0.5 rounded-full text-white"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                {currentAssignment.class.name}
              </span>
            )}
            {student.studentCategory && (
              <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                {student.studentCategory.name}
              </span>
            )}
            {student.gender && (
              <span className="text-xs text-slate-400">{student.gender}</span>
            )}
            {student.dateOfBirth && (
              <span className="text-xs text-slate-400">
                Age {getAge(student.dateOfBirth)}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Enrolled {new Date(student.enrolledAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>

        <button
          onClick={() => setPreviewOpen(true)}
          className="shrink-0 px-4 py-2 rounded-lg text-sm font-semibold text-white transition"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          Preview bill
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-slate-100 p-1 rounded-xl w-fit">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-4 py-1.5 rounded-lg text-sm font-medium transition',
              tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-6 py-5">
        {tab === 'Profile'          && <ProfileTab         student={student} onSaved={refetch} />}
        {tab === 'Guardians'        && <GuardiansTab       student={student} onSaved={refetch} />}
        {tab === 'Academic History' && <AcademicHistoryTab student={student} />}
        {tab === 'Performance'      && <PerformanceTab     studentId={student.id} />}
      </div>

      <InvoicePreviewModal data={previewOpen ? billPreview : null} onClose={() => setPreviewOpen(false)} />
    </div>
  );
}

function getAge(dateOfBirth: string): number {
  const today = new Date();
  const dob   = new Date(dateOfBirth);
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}
