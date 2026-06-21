'use client';

import { useState, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import { staffApi, type ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { useStaffAuth } from '@/contexts/staff-auth';
import { assignableRoles } from '@/lib/staff-roles';
import { FormField, Input, SaveButton, Alert } from '@/components/ui/settings-card';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/cn';

// ── Types ─────────────────────────────────────────────────────────────────────

type ClassAssignment  = { id: string; class: { id: string; name: string } };
type SubjectAssignment = { id: string; subject: { id: string; name: string } };

type UserDetail = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  createdAt: string;
  roles: { role: string }[];
  staffProfile: {
    id: string;
    staffId: string;
    designation: string | null;
    dateJoined: string | null;
    employmentType: string | null;
    phone: string | null;
    classAssignments: ClassAssignment[];
    subjectAssignments: SubjectAssignment[];
  } | null;
};

const ALL_ROLES = [
  { value: 'TEACHER',           label: 'Teacher'           },
  { value: 'ACCOUNTANT',        label: 'Accountant'        },
  { value: 'TRANSPORT_OFFICER', label: 'Transport Officer' },
  { value: 'HEADMASTER',        label: 'Headmaster / Headmistress' },
  { value: 'SCHOOL_ADMIN',      label: 'School Admin'      },
];

const TABS = ['Profile', 'Roles & Access', 'Assignments'] as const;
type Tab = typeof TABS[number];

// ── Profile tab ───────────────────────────────────────────────────────────────

function ProfileTab({ user, onSaved }: { user: UserDetail; onSaved: () => void }) {
  const profile = user.staffProfile;
  const [form, setForm] = useState({
    firstName:      user.firstName,
    lastName:       user.lastName,
    designation:    profile?.designation    ?? '',
    employmentType: profile?.employmentType ?? '',
    phone:          profile?.phone          ?? '',
    dateJoined:     profile?.dateJoined     ? profile.dateJoined.split('T')[0] : '',
  });
  const [saving, setSaving] = useState(false);
  const [alert, setAlert]   = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  async function save() {
    setAlert(null); setSaving(true);
    try {
      await staffApi.patch(`/school/staff/${user.id}/profile`, {
        designation:    form.designation    || null,
        employmentType: form.employmentType || null,
        phone:          form.phone          || null,
        dateJoined:     form.dateJoined     || null,
      });
      setAlert({ type: 'success', message: 'Profile saved.' });
      onSaved();
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Failed to save.' });
    } finally {
      setSaving(false);
    }
  }

  function f(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(v => ({ ...v, [field]: e.target.value }));
  }

  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} message={alert.message} />}

      <div className="grid grid-cols-2 gap-4">
        <FormField label="First name">
          <Input value={form.firstName} onChange={f('firstName')} disabled />
        </FormField>
        <FormField label="Last name">
          <Input value={form.lastName} onChange={f('lastName')} disabled />
        </FormField>
      </div>

      <FormField label="Email">
        <Input value={user.email} disabled />
      </FormField>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Designation">
          <Input value={form.designation} onChange={f('designation')} placeholder="e.g. Class Teacher" />
        </FormField>
        <FormField label="Employment type">
          <select
            value={form.employmentType}
            onChange={f('employmentType')}
            className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 outline-none"
          >
            <option value="">Not specified</option>
            <option value="FULL_TIME">Full time</option>
            <option value="PART_TIME">Part time</option>
            <option value="CONTRACT">Contract</option>
          </select>
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Phone">
          <Input value={form.phone} onChange={f('phone')} placeholder="+233 20 000 0000" />
        </FormField>
        <FormField label="Date joined">
          <Input type="date" value={form.dateJoined} onChange={f('dateJoined')} />
        </FormField>
      </div>

      <div className="flex justify-end pt-2">
        <SaveButton loading={saving} onClick={save} />
      </div>
    </div>
  );
}

// ── Roles & Access tab ────────────────────────────────────────────────────────

function RolesTab({ user, onSaved }: { user: UserDetail; onSaved: () => void }) {
  const { isOwner, isAdmin, isHeadmaster } = useStaffAuth();
  const router = useRouter();
  const currentRoles = user.roles.map(r => r.role);
  const [roles, setRoles]     = useState<string[]>(currentRoles);
  const [saving, setSaving]   = useState(false);
  const [resetting, setResetting] = useState(false);
  const [alert, setAlert]     = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  const isOwnerAccount = currentRoles.includes('SCHOOL_OWNER');
  const availableRoles = assignableRoles(ALL_ROLES, { isOwner, isAdmin, isHeadmaster });

  function toggleRole(role: string) {
    setRoles(r => r.includes(role) ? r.filter(x => x !== role) : [...r, role]);
  }

  async function saveRoles() {
    setAlert(null); setSaving(true);
    try {
      await staffApi.patch(`/school/users/${user.id}/roles`, { roles });
      setAlert({ type: 'success', message: 'Roles updated.' });
      onSaved();
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Failed to update roles.' });
    } finally {
      setSaving(false);
    }
  }

  async function resetPassword() {
    setResetting(true);
    try {
      const result = await staffApi.patch<{ tempPassword?: string }>(`/school/users/${user.id}/reset-password`);
      setAlert({ type: 'success', message: `Password reset. Temporary password: ${result.tempPassword ?? '(sent to email)'}` });
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Failed to reset password.' });
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="space-y-6">
      {alert && <Alert type={alert.type} message={alert.message} />}

      {/* Role assignment */}
      {!isOwnerAccount ? (
        <div>
          <p className="text-sm font-medium text-slate-700 mb-3">Assigned roles</p>
          <div className="flex flex-wrap gap-2 mb-4">
            {availableRoles.map(r => (
              <button
                key={r.value}
                type="button"
                onClick={() => toggleRole(r.value)}
                className="px-3.5 py-2 rounded-xl text-sm font-medium border transition"
                style={
                  roles.includes(r.value)
                    ? { backgroundColor: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff' }
                    : { borderColor: '#e2e8f0', color: '#475569' }
                }
              >
                {r.label}
              </button>
            ))}
          </div>
          {!isOwner && (
            <p className="text-xs text-slate-400 mb-4">Only the School Owner can assign the School Admin or Headmaster roles.</p>
          )}
          <SaveButton loading={saving} onClick={saveRoles} label="Update roles" />
        </div>
      ) : (
        <div className="px-4 py-3 bg-slate-50 rounded-xl text-sm text-slate-500">
          This is the School Owner account. Roles cannot be modified.
        </div>
      )}

      {/* User-level permission overrides — managing permissions is Owner/Admin only */}
      {!isOwnerAccount && (isOwner || isAdmin) && (
        <div className="pt-4 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700">User-level permission overrides</p>
              <p className="text-xs text-slate-400 mt-0.5">Grant or restrict specific permissions for this user, independent of their role.</p>
            </div>
            <button
              onClick={() => router.push(`/school/users/${user.id}/overrides`)}
              className="text-sm font-medium transition"
              style={{ color: 'var(--accent)' }}
            >
              Manage →
            </button>
          </div>
        </div>
      )}

      {/* Password reset */}
      <div className="pt-4 border-t border-slate-100">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-700">Reset password</p>
            <p className="text-xs text-slate-400 mt-0.5">Generate a temporary password for this staff member.</p>
          </div>
          <button
            onClick={resetPassword}
            disabled={resetting}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition disabled:opacity-40"
          >
            {resetting ? 'Resetting…' : 'Reset password'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Assignments tab ───────────────────────────────────────────────────────────

function AssignmentsTab({ user, onSaved }: { user: UserDetail; onSaved: () => void }) {
  const profile = user.staffProfile;
  const isTeacher = user.roles.some(r => r.role === 'TEACHER');

  const fetchClasses   = useCallback(() => staffApi.get<{ id: string; name: string }[]>('/school/grade-structure/classes'), []);
  const fetchSubjects  = useCallback(() => staffApi.get<{ id: string; name: string }[]>('/school/subjects'), []);
  const { data: allClasses }  = useApi(fetchClasses);
  const { data: allSubjects } = useApi(fetchSubjects);

  const [classId, setClassId]   = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [addingClass, setAddingClass]     = useState(false);
  const [addingSubject, setAddingSubject] = useState(false);
  const [removingClass, setRemovingClass]     = useState<string | null>(null);
  const [removingSubject, setRemovingSubject] = useState<string | null>(null);

  const assignedClassIds   = new Set(profile?.classAssignments.map(a => a.class.id) ?? []);
  const assignedSubjectIds = new Set(profile?.subjectAssignments.map(a => a.subject.id) ?? []);

  async function addClassAssignment() {
    if (!classId) return;
    setAddingClass(true);
    try {
      await staffApi.post(`/school/staff/${user.id}/class-assignments`, { classId });
      setClassId('');
      onSaved();
    } finally {
      setAddingClass(false);
    }
  }

  async function removeClassAssignment(classId: string) {
    setRemovingClass(classId);
    try {
      await staffApi.delete(`/school/staff/${user.id}/class-assignments/${classId}`);
      onSaved();
    } finally {
      setRemovingClass(null);
    }
  }

  async function addSubjectAssignment() {
    if (!subjectId) return;
    setAddingSubject(true);
    try {
      await staffApi.post(`/school/staff/${user.id}/subject-assignments`, { subjectId });
      setSubjectId('');
      onSaved();
    } finally {
      setAddingSubject(false);
    }
  }

  async function removeSubjectAssignment(assignmentId: string) {
    setRemovingSubject(assignmentId);
    try {
      await staffApi.delete(`/school/staff/${user.id}/subject-assignments/${assignmentId}`);
      onSaved();
    } finally {
      setRemovingSubject(null);
    }
  }

  if (!isTeacher) {
    return (
      <div className="py-8 text-center text-sm text-slate-400">
        Assignments are only applicable for staff with the Teacher role.
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Class assignments */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-semibold text-slate-700">Class teacher assignments</p>
            <p className="text-xs text-slate-400">Classes this teacher is responsible for as class teacher.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          {profile?.classAssignments.map(a => (
            <div key={a.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white" style={{ backgroundColor: 'var(--accent)' }}>
              <span>{a.class.name}</span>
              <button
                onClick={() => removeClassAssignment(a.class.id)}
                disabled={removingClass === a.class.id}
                className="text-white/70 hover:text-white transition disabled:opacity-40"
              >
                ×
              </button>
            </div>
          ))}
          {(profile?.classAssignments.length ?? 0) === 0 && (
            <span className="text-xs text-slate-400 italic">No class assignments</span>
          )}
        </div>
        <div className="flex gap-2">
          <select
            value={classId}
            onChange={e => setClassId(e.target.value)}
            className="flex-1 px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none"
          >
            <option value="">Select a class…</option>
            {allClasses?.filter(c => !assignedClassIds.has(c.id)).map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <SaveButton loading={addingClass} onClick={addClassAssignment} label="Assign" disabled={!classId} />
        </div>
      </div>

      {/* Subject assignments */}
      <div className="pt-4 border-t border-slate-100">
        <div className="mb-3">
          <p className="text-sm font-semibold text-slate-700">Subject teacher assignments</p>
          <p className="text-xs text-slate-400">Subjects this teacher is qualified to teach.</p>
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          {profile?.subjectAssignments.map(a => (
            <div key={a.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-700">
              <span>{a.subject.name}</span>
              <button
                onClick={() => removeSubjectAssignment(a.id)}
                disabled={removingSubject === a.id}
                className="text-slate-400 hover:text-red-400 transition disabled:opacity-40"
              >
                ×
              </button>
            </div>
          ))}
          {(profile?.subjectAssignments.length ?? 0) === 0 && (
            <span className="text-xs text-slate-400 italic">No subject assignments</span>
          )}
        </div>
        <div className="flex gap-2">
          <select
            value={subjectId}
            onChange={e => setSubjectId(e.target.value)}
            className="flex-1 px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none"
          >
            <option value="">Select a subject…</option>
            {allSubjects?.filter(s => !assignedSubjectIds.has(s.id)).map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <SaveButton loading={addingSubject} onClick={addSubjectAssignment} label="Assign" disabled={!subjectId} />
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router  = useRouter();
  const [tab, setTab] = useState<Tab>('Profile');

  const fetchUser = useCallback(() => staffApi.get<UserDetail>(`/school/users/${id}`), [id]);
  const { data: user, loading, refetch } = useApi(fetchUser);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-24 bg-slate-100 rounded-2xl animate-pulse" />
        <div className="h-64 bg-slate-100 rounded-2xl animate-pulse" />
      </div>
    );
  }

  if (!user) return <p className="text-sm text-slate-400">User not found.</p>;

  const isOwnerAccount = user.roles.some(r => r.role === 'SCHOOL_OWNER');

  return (
    <div>
      {/* Back */}
      <button
        onClick={() => router.push('/school/users')}
        className="text-sm text-slate-400 hover:text-slate-700 transition mb-5 flex items-center gap-1"
      >
        ← Back to staff
      </button>

      {/* User header */}
      <div className="flex items-center gap-4 mb-6">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center text-white text-lg font-bold shrink-0"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          {user.firstName[0]}{user.lastName[0]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-slate-900">{user.firstName} {user.lastName}</h1>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${user.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
              {user.isActive ? 'Active' : 'Inactive'}
            </span>
            {isOwnerAccount && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: 'var(--accent)' }}>
                School Owner
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-0.5">{user.email}</p>
          {user.staffProfile && (
            <p className="text-xs text-slate-400 mt-0.5">{user.staffProfile.staffId}{user.staffProfile.designation ? ` · ${user.staffProfile.designation}` : ''}</p>
          )}
        </div>
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
        {tab === 'Profile'       && <ProfileTab     user={user} onSaved={refetch} />}
        {tab === 'Roles & Access' && <RolesTab      user={user} onSaved={refetch} />}
        {tab === 'Assignments'   && <AssignmentsTab user={user} onSaved={refetch} />}
      </div>
    </div>
  );
}
