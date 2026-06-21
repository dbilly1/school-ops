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

type ClassAssignment = {
  id: string;
  class: { id: string; name: string };
};

type SubjectAssignment = {
  id: string;
  classId: string;
  class: { id: string; name: string };
  subject: { id: string; name: string };
};

type UserDetail = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  tempPassword: string | null;
  mustChange: boolean;
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

type ClassItem   = { id: string; name: string };
type SubjectItem = { id: string; name: string };

const ALL_ROLES = [
  { value: 'TEACHER',           label: 'Teacher'           },
  { value: 'ACCOUNTANT',        label: 'Accountant'        },
  { value: 'TRANSPORT_OFFICER', label: 'Transport Officer' },
  { value: 'HEADMASTER',        label: 'Headmaster / Headmistress' },
  { value: 'SCHOOL_ADMIN',      label: 'School Admin'      },
];

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

      {/* Temporary password banner — shown only while mustChange is true */}
      {user.mustChange && user.tempPassword && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-1">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
            Temporary password — not yet changed
          </p>
          <p className="font-mono text-amber-900 text-lg tracking-widest">{user.tempPassword}</p>
          <p className="text-xs text-amber-600">
            Share this with the staff member. It clears once they log in and set a new password.
          </p>
        </div>
      )}
      {user.mustChange && !user.tempPassword && (
        <p className="text-xs text-amber-500">· Password change required on next login</p>
      )}

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
  const [roles, setRoles]         = useState<string[]>(currentRoles);
  const [saving, setSaving]       = useState(false);
  const [resetting, setResetting] = useState(false);
  const [alert, setAlert]         = useState<{ type: 'error' | 'success'; message: string } | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

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
    setResetting(true); setTempPassword(null); setAlert(null);
    try {
      const result = await staffApi.patch<{ tempPassword?: string; message?: string }>(`/school/users/${user.id}/reset-password`);
      if (result.tempPassword) {
        setTempPassword(result.tempPassword);
      } else {
        setAlert({ type: 'success', message: 'Password reset. A reset email has been sent.' });
      }
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Failed to reset password.' });
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="space-y-6">
      {alert && <Alert type={alert.type} message={alert.message} />}

      {tempPassword && (
        <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-amber-800 mb-0.5">Password reset successfully</p>
            <p className="text-xs text-amber-700 mb-2">Share this temporary password with the staff member. They will be prompted to change it on next login.</p>
            <p className="font-mono text-lg font-bold text-amber-900 tracking-widest">{tempPassword}</p>
          </div>
          <button onClick={() => setTempPassword(null)} className="text-amber-400 hover:text-amber-600 transition shrink-0 text-lg leading-none">×</button>
        </div>
      )}

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

      {!isOwnerAccount && (isOwner || isAdmin) && (
        <div className="pt-4 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700">User-level permission overrides</p>
              <p className="text-xs text-slate-400 mt-0.5">Grant or restrict specific permissions for this user, independent of their role.</p>
            </div>
            <button
              onClick={() => router.push(`/school/staff/${user.id}/overrides`)}
              className="text-sm font-medium transition"
              style={{ color: 'var(--accent)' }}
            >
              Manage →
            </button>
          </div>
        </div>
      )}

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

/**
 * Groups flat subjectAssignments into { subject, classes[] } for display.
 * e.g. two assignments "Maths/Class4A" and "Maths/Class5B" → one group.
 */
function groupBySubject(assignments: SubjectAssignment[]) {
  const map = new Map<string, { subject: SubjectItem; entries: SubjectAssignment[] }>();
  for (const a of assignments) {
    // Guard: skip malformed entries missing class (created by old broken code)
    if (!a.class || !a.subject) continue;
    const existing = map.get(a.subject.id);
    if (existing) {
      existing.entries.push(a);
    } else {
      map.set(a.subject.id, { subject: a.subject, entries: [a] });
    }
  }
  return [...map.values()];
}

function AssignmentsTab({ user, onSaved }: { user: UserDetail; onSaved: () => void }) {
  const profile = user.staffProfile;

  const fetchClasses  = useCallback(() => staffApi.get<ClassItem[]>('/school/grade-structure/classes'), []);
  const fetchSubjects = useCallback(() => staffApi.get<SubjectItem[]>('/school/subjects'), []);
  const { data: allClasses }  = useApi(fetchClasses);
  const { data: allSubjects } = useApi(fetchSubjects);

  // ── Class teacher state ──────────────────────────────────────────────────────
  const [classId, setClassId]   = useState('');
  const [addingClass, setAddingClass]     = useState(false);
  const [removingClass, setRemovingClass] = useState<string | null>(null);

  // ── Subject assignment state ─────────────────────────────────────────────────
  // Adding: pick a subject, build up class chips, then save all at once
  const [newSubjectId, setNewSubjectId]   = useState('');
  const [newClassIds, setNewClassIds]     = useState<string[]>([]);
  const [addingSubject, setAddingSubject] = useState(false);
  const [removingAssignment, setRemovingAssignment] = useState<string | null>(null);

  const assignedClassIds = new Set(profile?.classAssignments.map(a => a.class.id) ?? []);

  // Already-assigned subject+class combos — used to prevent duplicates
  // Filter out malformed entries (a.class missing) so they don't cause crashes
  const validAssignments = (profile?.subjectAssignments ?? []).filter(a => a.class && a.subject);

  const assignedCombos = new Set(
    validAssignments.map(a => `${a.subject.id}:${a.classId}`)
  );

  // Classes already saved for the chosen subject (to prevent adding duplicates)
  const classesAlreadyForSubject = new Set(
    validAssignments
      .filter(a => a.subject.id === newSubjectId)
      .map(a => a.classId)
  );

  // Classes available to pick: must have a real id, not yet saved, not already staged
  const availableClassesToAdd = (allClasses ?? []).filter(
    c => !!c.id && !classesAlreadyForSubject.has(c.id) && !newClassIds.includes(c.id)
  );

  async function addClassAssignment() {
    if (!classId) return;
    setAddingClass(true);
    try {
      await staffApi.post(`/school/staff/${user.id}/class-assignments`, { classId });
      setClassId('');
      onSaved();
    } catch (err) {
      // Silently ignore conflict (already assigned)
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
    if (!newSubjectId || newClassIds.length === 0) return;
    setAddingSubject(true);
    try {
      // One API call per class — same subject taught in N classes
      for (const classId of newClassIds) {
        if (assignedCombos.has(`${newSubjectId}:${classId}`)) continue;
        await staffApi.post(`/school/staff/${user.id}/subject-assignments`, {
          subjectId: newSubjectId,
          classId,
        }).catch(() => {});
      }
      setNewSubjectId('');
      setNewClassIds([]);
      onSaved();
    } finally {
      setAddingSubject(false);
    }
  }

  async function removeSubjectAssignment(assignmentId: string) {
    setRemovingAssignment(assignmentId);
    try {
      await staffApi.delete(`/school/staff/${user.id}/subject-assignments/${assignmentId}`);
      onSaved();
    } finally {
      setRemovingAssignment(null);
    }
  }

  const grouped = groupBySubject(validAssignments);

  return (
    <div className="space-y-8">

      {/* ── Class teacher assignments ─────────────────────────────────────── */}
      <div>
        <p className="text-sm font-semibold text-slate-700 mb-0.5">Class teacher of</p>
        <p className="text-xs text-slate-400 mb-3">Classes this teacher is the homeroom/class teacher for.</p>

        {/* Current chips */}
        <div className="flex flex-wrap gap-2 mb-3">
          {(profile?.classAssignments.length ?? 0) === 0 && (
            <span className="text-xs text-slate-400 italic">No class teacher assignment yet</span>
          )}
          {profile?.classAssignments.map(a => (
            <span
              key={a.id}
              className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-lg text-sm font-medium text-white"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              {a.class.name}
              <button
                onClick={() => removeClassAssignment(a.class.id)}
                disabled={removingClass === a.class.id}
                className="w-4 h-4 flex items-center justify-center rounded text-white/70 hover:text-white disabled:opacity-40 transition"
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>

        {/* Add class */}
        <div className="flex gap-2">
          <select
            value={classId}
            onChange={e => setClassId(e.target.value)}
            className="flex-1 px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none"
          >
            <option value="">Assign to a class…</option>
            {(allClasses ?? []).filter(c => !assignedClassIds.has(c.id)).map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <SaveButton loading={addingClass} onClick={addClassAssignment} label="Assign" disabled={!classId} />
        </div>
      </div>

      {/* ── Subject assignments ───────────────────────────────────────────── */}
      <div className="pt-6 border-t border-slate-100">
        <p className="text-sm font-semibold text-slate-700 mb-0.5">Subject assignments</p>
        <p className="text-xs text-slate-400 mb-4">Subjects this teacher teaches and which classes they teach each subject in.</p>

        {/* Grouped list: one block per subject */}
        {grouped.length === 0 && (
          <p className="text-xs text-slate-400 italic mb-4">No subject assignments yet</p>
        )}
        <div className="space-y-3 mb-5">
          {grouped.map(({ subject, entries }) => (
            <div key={subject.id} className="border border-slate-100 rounded-xl p-3 bg-slate-50">
              <p className="text-sm font-semibold text-slate-700 mb-2">{subject.name}</p>
              <div className="flex flex-wrap gap-1.5">
                {entries.map(a => (
                  <span
                    key={a.id}
                    className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-0.5 rounded-full text-xs font-medium bg-violet-100 text-violet-800"
                  >
                    {a.class.name}
                    <button
                      onClick={() => removeSubjectAssignment(a.id)}
                      disabled={removingAssignment === a.id}
                      className="w-3.5 h-3.5 flex items-center justify-center rounded-full hover:bg-violet-200 disabled:opacity-40 transition"
                    >
                      <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Add subject assignment — subject first, then build class chips */}
        <div className="border border-slate-200 rounded-xl p-3 space-y-3 bg-slate-50">
          <p className="text-xs font-medium text-slate-500">Add a subject assignment</p>

          {/* Subject picker */}
          <select
            value={newSubjectId}
            onChange={e => { setNewSubjectId(e.target.value); setNewClassIds([]); }}
            className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-800 outline-none"
          >
            <option value="">Select subject…</option>
            {(allSubjects ?? []).map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          {/* Class chips + add-class picker — only shown once a subject is selected */}
          {newSubjectId && (
            <div className="flex flex-wrap items-center gap-1.5">
              {newClassIds.length === 0 && (
                <span className="text-xs text-slate-400 italic">Pick the classes they teach this subject in</span>
              )}
              {newClassIds.map(cid => {
                const name = (allClasses ?? []).find(c => c.id === cid)?.name ?? cid;
                return (
                  <span
                    key={`chip-${cid}`}
                    className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-0.5 rounded-full text-xs font-medium bg-violet-100 text-violet-800"
                  >
                    {name}
                    <button
                      type="button"
                      onClick={() => setNewClassIds(ids => ids.filter(id => id !== cid))}
                      className="w-3.5 h-3.5 flex items-center justify-center rounded-full hover:bg-violet-200 transition"
                    >
                      <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                );
              })}
              {availableClassesToAdd.length > 0 && (
                <select
                  value=""
                  onChange={e => {
                    const val = e.target.value;
                    if (val) setNewClassIds(ids => ids.includes(val) ? ids : [...ids, val]);
                  }}
                  className="h-6 pl-2 pr-5 text-xs border border-dashed border-slate-300 rounded-full text-slate-500 bg-white outline-none cursor-pointer hover:border-violet-400 hover:text-violet-700 transition"
                >
                  <option value="">+ Add class</option>
                  {availableClassesToAdd.map(c => (
                    <option key={`opt-${c.id}`} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
              {availableClassesToAdd.length === 0 && newClassIds.length > 0 && (
                <span className="text-xs text-slate-400 italic">All classes assigned</span>
              )}
            </div>
          )}

          <div className="flex justify-end">
            <SaveButton
              loading={addingSubject}
              onClick={addSubjectAssignment}
              label="Save assignments"
              disabled={!newSubjectId || newClassIds.length === 0}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router  = useRouter();

  const fetchUser = useCallback(() => staffApi.get<UserDetail>(`/school/users/${id}`), [id]);
  const { data: user, loading, refetch } = useApi(fetchUser);

  const [togglingActive, setTogglingActive] = useState(false);

  const isTeacher    = user?.roles.some(r => r.role === 'TEACHER') ?? false;
  const isOwnerAcct  = user?.roles.some(r => r.role === 'SCHOOL_OWNER') ?? false;

  const TABS = isTeacher
    ? (['Profile', 'Roles & Access', 'Assignments'] as const)
    : (['Profile', 'Roles & Access'] as const);

  type Tab = typeof TABS[number];
  const [tab, setTab] = useState<Tab>('Profile');

  async function toggleActive() {
    if (!user) return;
    setTogglingActive(true);
    try {
      await staffApi.patch(`/school/users/${user.id}/${user.isActive ? 'deactivate' : 'activate'}`);
      refetch();
    } finally {
      setTogglingActive(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-24 bg-slate-100 rounded-2xl animate-pulse" />
        <div className="h-64 bg-slate-100 rounded-2xl animate-pulse" />
      </div>
    );
  }

  if (!user) return <p className="text-sm text-slate-400">User not found.</p>;

  return (
    <div>
      {/* Back */}
      <button
        onClick={() => router.push('/school/staff')}
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
            {isOwnerAcct && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: 'var(--accent)' }}>
                School Owner
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-0.5">{user.email}</p>
          {user.staffProfile && (
            <p className="text-xs text-slate-400 mt-0.5">
              {user.staffProfile.staffId}
              {user.staffProfile.designation ? ` · ${user.staffProfile.designation}` : ''}
            </p>
          )}
        </div>

        {/* Activate / Deactivate */}
        {!isOwnerAcct && (
          <button
            onClick={toggleActive}
            disabled={togglingActive}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium border transition disabled:opacity-40 shrink-0',
              user.isActive
                ? 'border-red-200 text-red-600 hover:bg-red-50'
                : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50',
            )}
          >
            {togglingActive ? '…' : user.isActive ? 'Deactivate' : 'Activate'}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-slate-100 p-1 rounded-xl w-fit">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t as Tab)}
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
        {tab === 'Profile'        && <ProfileTab     user={user} onSaved={refetch} />}
        {tab === 'Roles & Access' && <RolesTab       user={user} onSaved={refetch} />}
        {tab === 'Assignments'    && <AssignmentsTab user={user} onSaved={refetch} />}
      </div>
    </div>
  );
}
