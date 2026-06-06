'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { staffApi, type ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { useStaffAuth } from '@/contexts/staff-auth';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, SaveButton, Alert } from '@/components/ui/settings-card';

// â"€â"€ Types â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

type UserListItem = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  roles: { role: string }[];
  staffProfile: { staffId: string; designation: string | null } | null;
};

const ALL_ROLES = [
  { value: 'TEACHER',           label: 'Teacher'           },
  { value: 'ACCOUNTANT',        label: 'Accountant'        },
  { value: 'TRANSPORT_OFFICER', label: 'Transport Officer' },
  { value: 'SCHOOL_ADMIN',      label: 'School Admin'      },
];

const ROLE_COLORS: Record<string, string> = {
  SCHOOL_OWNER:      '#065f46',
  SCHOOL_ADMIN:      '#1e40af',
  TEACHER:           '#6d28d9',
  ACCOUNTANT:        '#b45309',
  TRANSPORT_OFFICER: '#0f766e',
};

function RoleBadge({ role }: { role: string }) {
  const label = role.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
  return (
    <span
      className="inline-block px-2 py-0.5 rounded-full text-xs font-medium text-white"
      style={{ backgroundColor: ROLE_COLORS[role] ?? '#64748b' }}
    >
      {label}
    </span>
  );
}

// â"€â"€ Invite modal â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

// ── Types for teacher assignment builder ─────────────────────────────────────

/** One subject → many classes */
type SubjectEntry = { subjectId: string; classIds: string[] };
type ClassItem    = { id: string; name: string };
type SubjectItem  = { id: string; name: string };

// ── Subject entry row ─────────────────────────────────────────────────────────

function SubjectEntryRow({ entry, index, classes, subjects, onChange, onRemove, canRemove }: {
  entry: SubjectEntry;
  index: number;
  classes: ClassItem[];
  subjects: SubjectItem[];
  onChange: (i: number, updated: SubjectEntry) => void;
  onRemove: (i: number) => void;
  canRemove: boolean;
}) {
  // Classes not yet added to this entry
  const availableClasses = classes.filter(c => !entry.classIds.includes(c.id));

  function addClass(classId: string) {
    if (!classId || entry.classIds.includes(classId)) return;
    onChange(index, { ...entry, classIds: [...entry.classIds, classId] });
  }

  function removeClass(classId: string) {
    onChange(index, { ...entry, classIds: entry.classIds.filter(id => id !== classId) });
  }

  function setSubject(subjectId: string) {
    onChange(index, { ...entry, subjectId });
  }

  const className = (id: string) => classes.find(c => c.id === id)?.name ?? id;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        {/* Subject picker */}
        <select
          value={entry.subjectId}
          onChange={e => setSubject(e.target.value)}
          className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-800 outline-none bg-white"
        >
          <option value="">Select subject…</option>
          {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {/* Remove subject row */}
        {canRemove && (
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="w-7 h-7 shrink-0 flex items-center justify-center rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Class chips + add-class picker */}
      <div className="flex flex-wrap items-center gap-1.5 pl-0.5">
        {entry.classIds.length === 0 && (
          <span className="text-xs text-slate-400 italic">No classes yet — pick at least one below</span>
        )}
        {entry.classIds.map(cid => (
          <span
            key={cid}
            className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-0.5 rounded-full text-xs font-medium bg-violet-100 text-violet-800"
          >
            {className(cid)}
            <button
              type="button"
              onClick={() => removeClass(cid)}
              className="w-3.5 h-3.5 flex items-center justify-center rounded-full hover:bg-violet-200 transition"
            >
              <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </span>
        ))}
        {/* Add class dropdown — only shows unselected classes */}
        {availableClasses.length > 0 && (
          <select
            value=""
            onChange={e => { addClass(e.target.value); e.target.value = ''; }}
            className="h-6 pl-2 pr-5 text-xs border border-dashed border-slate-300 rounded-full text-slate-500 bg-white outline-none cursor-pointer hover:border-violet-400 hover:text-violet-700 transition"
          >
            <option value="">+ Add class</option>
            {availableClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>
    </div>
  );
}

// ── Invite modal ──────────────────────────────────────────────────────────────

function InviteModal({ open, onClose, onInvited }: { open: boolean; onClose: () => void; onInvited: () => void }) {
  const { isOwner } = useStaffAuth();

  const [form, setForm]         = useState({ firstName: '', lastName: '', email: '', roles: [] as string[] });
  const [classTeacherId, setClassTeacherId] = useState('');
  const [subjectEntries, setSubjectEntries] = useState<SubjectEntry[]>([{ subjectId: '', classIds: [] }]);
  const [saving, setSaving]     = useState(false);
  const [alert, setAlert]       = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  const isTeacher = form.roles.includes('TEACHER');

  const fetchClasses  = useCallback(() => staffApi.get<ClassItem[]>('/school/grade-structure/classes'), []);
  const fetchSubjects = useCallback(() => staffApi.get<SubjectItem[]>('/school/subjects'), []);
  const { data: classes }  = useApi(fetchClasses);
  const { data: subjects } = useApi(fetchSubjects);

  function reset() {
    setForm({ firstName: '', lastName: '', email: '', roles: [] });
    setClassTeacherId('');
    setSubjectEntries([{ subjectId: '', classIds: [] }]);
    setAlert(null);
  }

  function handleClose() { reset(); onClose(); }

  function toggleRole(role: string) {
    setForm(f => ({
      ...f,
      roles: f.roles.includes(role) ? f.roles.filter(r => r !== role) : [...f.roles, role],
    }));
  }

  function updateSubjectEntry(i: number, updated: SubjectEntry) {
    setSubjectEntries(entries => entries.map((e, idx) => idx === i ? updated : e));
  }

  function addSubjectEntry()         { setSubjectEntries(e => [...e, { subjectId: '', classIds: [] }]); }
  function removeSubjectEntry(i: number) { setSubjectEntries(e => e.filter((_, idx) => idx !== i)); }

  async function invite() {
    if (!form.firstName || !form.lastName || !form.email) {
      setAlert({ type: 'error', message: 'Name and email are required.' }); return;
    }
    if (form.roles.length === 0) {
      setAlert({ type: 'error', message: 'Assign at least one role.' }); return;
    }
    setAlert(null); setSaving(true);
    try {
      // Step 1: create the staff account
      const created = await staffApi.post<{ id: string }>('/school/users/invite', {
        firstName: form.firstName,
        lastName:  form.lastName,
        email:     form.email,
        roles:     form.roles,
      });

      // Step 2: teacher assignments — best-effort, don't block invitation on failure
      if (isTeacher) {
        if (classTeacherId) {
          await staffApi.post(`/school/staff/${created.id}/class-assignments`, { classId: classTeacherId }).catch(() => {});
        }
        // Flatten: each subject × each of its classes → one API call
        for (const entry of subjectEntries) {
          if (!entry.subjectId) continue;
          for (const classId of entry.classIds) {
            await staffApi.post(`/school/staff/${created.id}/subject-assignments`, {
              subjectId: entry.subjectId,
              classId,
            }).catch(() => {});
          }
        }
      }

      setAlert({ type: 'success', message: `Invitation sent to ${form.email}.` });
      reset();
      onInvited();
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Failed to invite user.' });
    } finally {
      setSaving(false);
    }
  }

  const availableRoles = isOwner
    ? ALL_ROLES
    : ALL_ROLES.filter(r => r.value !== 'SCHOOL_ADMIN');

  return (
    <Modal open={open} onClose={handleClose} title="Invite staff member" width="max-w-lg">
      <div className="space-y-5">
        {alert && <Alert type={alert.type} message={alert.message} />}

        {/* Basic info */}
        <div className="grid grid-cols-2 gap-3">
          <FormField label="First name" required>
            <Input value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} placeholder="Kwame" />
          </FormField>
          <FormField label="Last name" required>
            <Input value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} placeholder="Mensah" />
          </FormField>
        </div>

        <FormField label="Email address" required>
          <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="staff@school.com" />
        </FormField>

        {/* Role selector */}
        <div>
          <p className="text-sm font-medium text-slate-700 mb-2">
            Roles<span className="text-red-400 ml-0.5">*</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {availableRoles.map(r => (
              <button
                key={r.value}
                type="button"
                onClick={() => toggleRole(r.value)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium border transition"
                style={
                  form.roles.includes(r.value)
                    ? { backgroundColor: ROLE_COLORS[r.value], borderColor: ROLE_COLORS[r.value], color: '#fff' }
                    : { borderColor: '#e2e8f0', color: '#475569' }
                }
              >
                {r.label}
              </button>
            ))}
          </div>
          {!isOwner && (
            <p className="text-xs text-slate-400 mt-1.5">Only the School Owner can appoint School Admins.</p>
          )}
        </div>

        {/* Teacher assignments — expands when TEACHER role is selected */}
        {isTeacher && (
          <div className="border border-violet-200 rounded-xl p-4 space-y-4 bg-violet-50/40">
            <p className="text-sm font-semibold text-slate-700">
              Teacher assignments
              <span className="ml-1.5 text-xs font-normal text-slate-400">— optional, can be updated from their profile later</span>
            </p>

            {/* Class teacher assignment */}
            <FormField label="Class teacher of">
              <select
                value={classTeacherId}
                onChange={e => setClassTeacherId(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-800 outline-none"
              >
                <option value="">None — not a class teacher</option>
                {(classes ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </FormField>

            {/* Subject assignments — one subject → many classes */}
            <div>
              <p className="text-xs font-medium text-slate-600 mb-2">
                Subject assignments
                <span className="ml-1 font-normal text-slate-400">— select a subject then add the classes they teach it in</span>
              </p>
              <div className="space-y-2">
                {subjectEntries.map((entry, i) => (
                  <SubjectEntryRow
                    key={i}
                    index={i}
                    entry={entry}
                    classes={classes ?? []}
                    subjects={subjects ?? []}
                    onChange={updateSubjectEntry}
                    onRemove={removeSubjectEntry}
                    canRemove={subjectEntries.length > 1}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={addSubjectEntry}
                className="mt-2 text-xs font-medium transition"
                style={{ color: 'var(--accent)' }}
              >
                + Add another subject
              </button>
            </div>
          </div>
        )}

        <div className="flex justify-end pt-1">
          <SaveButton loading={saving} onClick={invite} label="Send invitation" />
        </div>
      </div>
    </Modal>
  );
}

// ── Delete confirm modal ──────────────────────────────────────────────────────

function DeleteConfirmModal({ open, user, onClose, onDeleted }: {
  open: boolean;
  user: UserListItem;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  async function confirmDelete() {
    setDeleting(true);
    setError(null);
    try {
      await staffApi.delete(`/school/users/${user.id}`);
      onDeleted();
      onClose();
    } catch (err) {
      setError((err as ApiError).message ?? 'Failed to remove user.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Remove staff member" width="max-w-md">
      <div className="space-y-4">
        {error && <Alert type="error" message={error} />}
        <p className="text-sm text-slate-600">
          Are you sure you want to permanently remove{' '}
          <span className="font-semibold text-slate-800">{user.firstName} {user.lastName}</span>?
          This will delete their account and all associated data. This action cannot be undone.
        </p>
        <div className="flex justify-end gap-3 pt-1">
          <button
            onClick={onClose}
            disabled={deleting}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={confirmDelete}
            disabled={deleting}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-red-500 hover:bg-red-600 transition disabled:opacity-40"
          >
            {deleting ? 'Removing…' : 'Remove permanently'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── User row ──────────────────────────────────────────────────────────────────

function UserRow({ user, onAction, onRequestDelete }: {
  user: UserListItem;
  onAction: () => void;
  onRequestDelete: (user: UserListItem) => void;
}) {
  const router  = useRouter();
  const [acting, setActing] = useState(false);

  const isOwnerAccount = user.roles.some(r => r.role === 'SCHOOL_OWNER');

  async function toggleActive() {
    setActing(true);
    try {
      await staffApi.patch(`/school/users/${user.id}/${user.isActive ? 'deactivate' : 'activate'}`);
      onAction();
    } finally {
      setActing(false);
    }
  }

  return (
    <tr
      className="border-b border-slate-50 hover:bg-slate-50/50 transition cursor-pointer"
      onClick={() => router.push(`/school/staff/${user.id}`)}
    >
        <td className="px-4 py-3.5">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              {user.firstName[0]}{user.lastName[0]}
            </div>
            <div>
              <p className="text-sm font-medium text-slate-800">{user.firstName} {user.lastName}</p>
              <p className="text-xs text-slate-400">{user.email}</p>
            </div>
          </div>
        </td>
        <td className="px-4 py-3.5">
          <p className="text-xs text-slate-500">{user.staffProfile?.staffId ?? '—'}</p>
        </td>
        <td className="px-4 py-3.5">
          <div className="flex flex-wrap gap-1">
            {user.roles.map(r => <RoleBadge key={r.role} role={r.role} />)}
          </div>
        </td>
        <td className="px-4 py-3.5">
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${user.isActive ? 'text-emerald-700' : 'text-slate-400'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${user.isActive ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            {user.isActive ? 'Active' : 'Inactive'}
          </span>
        </td>
        <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-3 justify-end">
            {!isOwnerAccount && (
              <>
                <button
                  onClick={toggleActive}
                  disabled={acting}
                  className={`text-xs font-medium transition disabled:opacity-40 ${user.isActive ? 'text-slate-400 hover:text-amber-600' : 'text-slate-400 hover:text-emerald-700'}`}
                >
                  {acting ? '…' : user.isActive ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  onClick={() => onRequestDelete(user)}
                  className="text-xs font-medium text-slate-300 hover:text-red-500 transition"
                >
                  Remove
                </button>
              </>
            )}
          </div>
        </td>
    </tr>
  );
}

// â"€â"€ Page â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

export default function UsersPage() {
  const { isOwner, isAdmin } = useStaffAuth();
  const [showInvite, setShowInvite]           = useState(false);
  const [deleteTarget, setDeleteTarget]       = useState<UserListItem | null>(null);
  const [search, setSearch]                   = useState('');
  const [roleFilter, setRoleFilter]           = useState('');

  const fetchUsers = useCallback(() => staffApi.get<UserListItem[]>('/school/users'), []);
  const { data: users, loading, refetch } = useApi(fetchUsers);

  const filtered = users?.filter(u => {
    const matchesSearch = !search || `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(search.toLowerCase());
    const matchesRole   = !roleFilter || u.roles.some(r => r.role === roleFilter);
    return matchesSearch && matchesRole;
  });

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Staff</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage staff accounts, roles, and access.</p>
        </div>
        <div className="flex items-center gap-3">
          {(isOwner || isAdmin) && (
            <button
              onClick={() => window.location.href = '/school/staff/permissions'}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
            >
              Role permissions
            </button>
          )}
          <button
            onClick={() => setShowInvite(true)}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition"
            style={{ backgroundColor: 'var(--accent)' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--accent-hover)'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--accent)'}
          >
            + Invite staff
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or emailâ€¦"
          className="flex-1 max-w-xs px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 outline-none"
          onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'}
          onBlur={e => e.currentTarget.style.boxShadow = ''}
        />
        <select
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
          className="px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 outline-none"
        >
          <option value="">All roles</option>
          {ALL_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          <option value="SCHOOL_OWNER">School Owner</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Name</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Staff ID</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Roles</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-slate-50">
                  <td className="px-4 py-3.5" colSpan={5}>
                    <div className="h-8 bg-slate-100 rounded-lg animate-pulse" />
                  </td>
                </tr>
              ))
            )}
            {!loading && filtered?.map(user => (
              <UserRow key={user.id} user={user} onAction={refetch} onRequestDelete={setDeleteTarget} />
            ))}
            {!loading && (!filtered || filtered.length === 0) && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-sm text-slate-400">
                  {search || roleFilter ? 'No staff match your filters.' : 'No staff yet. Invite your first team member.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <InviteModal open={showInvite} onClose={() => setShowInvite(false)} onInvited={refetch} />
      {deleteTarget && (
        <DeleteConfirmModal
          open={!!deleteTarget}
          user={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => { setDeleteTarget(null); refetch(); }}
        />
      )}
    </div>
  );
}

