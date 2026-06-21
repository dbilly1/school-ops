'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { staffApi, type ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { useStaffAuth } from '@/contexts/staff-auth';
import { assignableRoles } from '@/lib/staff-roles';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, SaveButton, Alert } from '@/components/ui/settings-card';

// ── Types ─────────────────────────────────────────────────────────────────────

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
  { value: 'HEADMASTER',        label: 'Headmaster / Headmistress' },
  { value: 'SCHOOL_ADMIN',      label: 'School Admin'      },
];

const ROLE_COLORS: Record<string, string> = {
  SCHOOL_OWNER:      '#065f46',
  SCHOOL_ADMIN:      '#1e40af',
  HEADMASTER:        '#4338ca',
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

// ── Invite modal ──────────────────────────────────────────────────────────────

function InviteModal({ open, onClose, onInvited }: { open: boolean; onClose: () => void; onInvited: () => void }) {
  const { isOwner, isAdmin, isHeadmaster } = useStaffAuth();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', roles: [] as string[] });
  const [saving, setSaving] = useState(false);
  const [alert, setAlert]   = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  function toggleRole(role: string) {
    setForm(f => ({
      ...f,
      roles: f.roles.includes(role) ? f.roles.filter(r => r !== role) : [...f.roles, role],
    }));
  }

  async function invite() {
    if (!form.firstName || !form.lastName || !form.email) {
      setAlert({ type: 'error', message: 'Name and email are required.' }); return;
    }
    if (form.roles.length === 0) {
      setAlert({ type: 'error', message: 'Assign at least one role.' }); return;
    }
    setAlert(null); setSaving(true);
    try {
      await staffApi.post('/school/users/invite', form);
      setAlert({ type: 'success', message: `Invitation sent to ${form.email}. A temporary password has been generated.` });
      setForm({ firstName: '', lastName: '', email: '', roles: [] });
      onInvited();
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Failed to invite user.' });
    } finally {
      setSaving(false);
    }
  }

  const availableRoles = assignableRoles(ALL_ROLES, { isOwner, isAdmin, isHeadmaster });

  return (
    <Modal open={open} onClose={onClose} title="Invite staff member">
      <div className="space-y-4">
        {alert && <Alert type={alert.type} message={alert.message} />}

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

        <div>
          <p className="text-sm font-medium text-slate-700 mb-2">Roles<span className="text-red-400 ml-0.5">*</span></p>
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

        <div className="flex justify-end pt-2">
          <SaveButton loading={saving} onClick={invite} label="Send invitation" />
        </div>
      </div>
    </Modal>
  );
}

// ── User row ──────────────────────────────────────────────────────────────────

function UserRow({ user, onAction }: { user: UserListItem; onAction: () => void }) {
  const router  = useRouter();
  const [acting, setActing] = useState(false);

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
    <tr className="border-b border-slate-50 hover:bg-slate-50/50 transition">
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
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-3 justify-end">
          <button
            onClick={() => router.push(`/school/users/${user.id}`)}
            className="text-xs font-medium transition"
            style={{ color: 'var(--accent)' }}
          >
            View
          </button>
          <button
            onClick={toggleActive}
            disabled={acting}
            className={`text-xs font-medium transition disabled:opacity-40 ${user.isActive ? 'text-slate-400 hover:text-red-500' : 'text-slate-400 hover:text-emerald-700'}`}
          >
            {acting ? '…' : user.isActive ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const { isOwner, isAdmin } = useStaffAuth();
  const [showInvite, setShowInvite] = useState(false);
  const [search, setSearch]         = useState('');
  const [roleFilter, setRoleFilter] = useState('');

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
              onClick={() => window.location.href = '/school/users/permissions'}
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
          placeholder="Search by name or email…"
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
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
        <table className="w-full min-w-[640px]">
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
              <UserRow key={user.id} user={user} onAction={refetch} />
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
    </div>
  );
}
