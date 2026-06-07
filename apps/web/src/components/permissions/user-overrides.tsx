'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { staffApi, type ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { useStaffAuth } from '@/contexts/staff-auth';
import { clearPermissionCache } from '@/hooks/use-permission';
import { Alert } from '@/components/ui/settings-card';

// ── Constants (mirror the role-permissions matrix) ────────────────────────────

const ACTIONS = ['VIEW', 'CREATE', 'EDIT', 'DELETE'] as const;
type Action = typeof ACTIONS[number];

const FEATURES = [
  { key: 'admissions', label: 'Admissions', subFeatures: [
    { key: 'lead_tracking', label: 'Lead tracking' },
    { key: 'inquiry_stage', label: 'Inquiry stage' },
    { key: 'application_stage', label: 'Application stage' },
    { key: 'interview_stage', label: 'Interview stage' },
    { key: 'acceptance_stage', label: 'Acceptance stage' },
  ]},
  { key: 'academics', label: 'Academics', subFeatures: [
    { key: 'assessments', label: 'Assessments' },
    { key: 'exams', label: 'Exams' },
    { key: 'grading', label: 'Grading' },
    { key: 'report_cards', label: 'Report cards' },
    { key: 'transcripts', label: 'Transcripts' },
  ]},
  { key: 'attendance', label: 'Attendance', subFeatures: [
    { key: 'student_attendance', label: 'Student attendance' },
    { key: 'staff_attendance', label: 'Staff attendance' },
    { key: 'attendance_analytics', label: 'Attendance analytics' },
  ]},
  { key: 'finance', label: 'Finance', subFeatures: [
    { key: 'fee_structures', label: 'Fee structures' },
    { key: 'invoicing', label: 'Invoicing' },
    { key: 'receipts', label: 'Receipts' },
    { key: 'outstanding_balance_tracking', label: 'Outstanding balance tracking' },
    { key: 'discount_management', label: 'Discount management' },
  ]},
  { key: 'feeding_fees', label: 'Feeding Fees', subFeatures: [] },
  { key: 'transport', label: 'Transport', subFeatures: [
    { key: 'vehicles', label: 'Vehicles' },
    { key: 'routes', label: 'Routes' },
    { key: 'drivers', label: 'Drivers' },
    { key: 'student_assignment', label: 'Student assignment' },
    { key: 'pickup_points', label: 'Pickup points' },
  ]},
  { key: 'communication', label: 'Communication', subFeatures: [
    { key: 'notices', label: 'Notices' },
    { key: 'announcements', label: 'Announcements' },
    { key: 'internal_messaging', label: 'Internal messaging' },
  ]},
  { key: 'students', label: 'Students', subFeatures: [] },
  { key: 'staff', label: 'Staff', subFeatures: [] },
  { key: 'reports', label: 'Reports', subFeatures: [] },
];

// ── Types ─────────────────────────────────────────────────────────────────────

type OverrideState = 'granted' | 'denied' | 'default';

type PermissionDefault = {
  role: string; featureKey: string; subFeatureKey: string | null; action: Action; allowed: boolean;
};
type UserOverride = {
  id: string; featureKey: string; subFeatureKey: string | null; action: Action; granted: boolean;
};
type UserDetail = {
  id: string; firstName: string; lastName: string; email: string;
  roles: { role: string }[];
};

type OverrideMap = Map<string, OverrideState>;

function makeKey(featureKey: string, subFeatureKey: string | null, action: Action) {
  return `${featureKey}:${subFeatureKey ?? ''}:${action}`;
}

// ── Action cell ───────────────────────────────────────────────────────────────

function ActionCell({ defaultAllowed, state, onChange, disabled }: {
  defaultAllowed: boolean; state: OverrideState; onChange: (next: OverrideState) => void; disabled: boolean;
}) {
  function cycle() {
    if (disabled) return;
    const next: OverrideState = state === 'default' ? (defaultAllowed ? 'denied' : 'granted')
                              : state === 'granted'  ? 'denied'
                              : 'default';
    onChange(next);
  }

  const effectivelyAllowed = state === 'granted' ? true : state === 'denied' ? false : defaultAllowed;
  const isOverridden = state !== 'default';

  return (
    <button
      type="button"
      onClick={cycle}
      disabled={disabled}
      title={`${effectivelyAllowed ? 'Allowed' : 'Denied'}${isOverridden ? ' (overridden)' : ' (default)'}\nClick to cycle`}
      className="w-8 h-8 rounded-lg flex items-center justify-center transition mx-auto disabled:cursor-default"
      style={
        effectivelyAllowed
          ? isOverridden ? { backgroundColor: 'var(--accent)', color: '#fff' } : { backgroundColor: '#d1fae5', color: '#065f46' }
          : isOverridden ? { backgroundColor: '#fee2e2', color: '#dc2626' } : { backgroundColor: '#f8fafc', color: '#cbd5e1' }
      }
    >
      {effectivelyAllowed ? (
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
      ) : (
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
      )}
    </button>
  );
}

// ── Feature section ───────────────────────────────────────────────────────────

function FeatureSection({ feature, overrides, getDefault, onChange, disabled }: {
  feature: typeof FEATURES[number];
  overrides: OverrideMap;
  getDefault: (fk: string, sfk: string | null, action: Action) => boolean;
  onChange: (key: string, state: OverrideState) => void;
  disabled: boolean;
}) {
  const [expanded, setExpanded] = useState(true);

  const getState = (fk: string, sfk: string | null, action: Action): OverrideState =>
    overrides.get(makeKey(fk, sfk, action)) ?? 'default';

  const rows = [
    { featureKey: feature.key, subFeatureKey: null as string | null, label: feature.label, isParent: true },
    ...feature.subFeatures.map(sf => ({ featureKey: feature.key, subFeatureKey: sf.key, label: sf.label, isParent: false })),
  ];

  return (
    <div className="border-b border-slate-100 last:border-0">
      {rows.map(row => {
        if (!row.isParent && !expanded) return null;
        return (
          <div key={`${row.featureKey}:${row.subFeatureKey}`} className={`flex items-center ${row.isParent ? 'bg-slate-50' : ''}`}>
            <div className={`flex-1 px-4 py-2.5 text-sm flex items-center gap-2 ${row.isParent ? 'font-semibold text-slate-700' : 'text-slate-600 pl-8'}`}>
              {row.isParent && feature.subFeatures.length > 0 && (
                <button type="button" onClick={() => setExpanded(e => !e)} className="text-slate-400 hover:text-slate-700 transition text-xs w-4">
                  {expanded ? '▾' : '▸'}
                </button>
              )}
              {row.isParent && feature.subFeatures.length === 0 && <span className="w-4" />}
              {!row.isParent && <span className="w-4" />}
              {row.label}
            </div>
            {ACTIONS.map(action => (
              <div key={action} className="w-16 text-center py-2">
                <ActionCell
                  defaultAllowed={getDefault(row.featureKey, row.subFeatureKey, action)}
                  state={getState(row.featureKey, row.subFeatureKey, action)}
                  onChange={next => onChange(makeKey(row.featureKey, row.subFeatureKey, action), next)}
                  disabled={disabled}
                />
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function UserOverrides({ userId, backHref }: { userId: string; backHref: string }) {
  const router = useRouter();
  const { isOwner, isAdmin } = useStaffAuth();
  const canEdit = isOwner || isAdmin;

  const [overrides, setOverrides]           = useState<OverrideMap>(new Map());
  const [pendingChanges, setPendingChanges] = useState<Map<string, OverrideState>>(new Map());
  const [saving, setSaving]                 = useState(false);
  const [alert, setAlert]                   = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  const fetchUser      = useCallback(() => staffApi.get<UserDetail>(`/school/users/${userId}`), [userId]);
  const fetchDefaults  = useCallback(() => staffApi.get<PermissionDefault[]>('/school/permissions/defaults'), []);
  const fetchOverrides = useCallback(() => staffApi.get<UserOverride[]>(`/school/users/${userId}/overrides`), [userId]);

  const { data: user, loading: userLoading }      = useApi(fetchUser);
  const { data: defaults }                        = useApi(fetchDefaults);
  const { data: userOverrides, refetch }          = useApi(fetchOverrides);

  useEffect(() => {
    const map: OverrideMap = new Map();
    userOverrides?.forEach(o => map.set(makeKey(o.featureKey, o.subFeatureKey, o.action), o.granted ? 'granted' : 'denied'));
    setOverrides(map);
    setPendingChanges(new Map());
  }, [userOverrides]);

  const userRoles = user?.roles.map(r => r.role) ?? [];

  // A user's default for a cell = allowed if ANY of their roles allows it.
  const getDefault = useCallback(
    (fk: string, sfk: string | null, action: Action): boolean =>
      (defaults ?? []).some(d =>
        userRoles.includes(d.role) && d.featureKey === fk &&
        d.subFeatureKey === sfk && d.action === action && d.allowed),
    [defaults, userRoles],
  );

  function handleCellChange(key: string, state: OverrideState) {
    setPendingChanges(m => { const next = new Map(m); next.set(key, state); return next; });
    setOverrides(m => { const next = new Map(m); next.set(key, state); return next; });
  }

  async function saveAll() {
    if (pendingChanges.size === 0) return;
    setAlert(null); setSaving(true);
    try {
      const promises: Promise<unknown>[] = [];
      pendingChanges.forEach((state, key) => {
        const [featureKey, subFeatureKey, action] = key.split(':');
        if (state === 'default') {
          const params = new URLSearchParams({ featureKey, subFeatureKey: subFeatureKey || '', action });
          promises.push(staffApi.delete(`/school/users/${userId}/overrides?${params}`));
        } else {
          promises.push(staffApi.post(`/school/users/${userId}/overrides`, {
            featureKey, subFeatureKey: subFeatureKey || null, action, granted: state === 'granted',
          }));
        }
      });
      await Promise.all(promises);
      setPendingChanges(new Map());
      clearPermissionCache();
      setAlert({ type: 'success', message: 'Permission overrides saved.' });
      refetch();
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Failed to save.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {/* Back */}
      <button onClick={() => router.push(backHref)}
        className="text-sm text-slate-400 hover:text-slate-700 transition mb-5 flex items-center gap-1">
        ← Back
      </button>

      <div className="flex items-start justify-between mb-5 gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Permission overrides</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {userLoading ? 'Loading…' : user ? `${user.firstName} ${user.lastName} · ${userRoles.join(', ') || 'No role'}` : 'User'}
          </p>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            Cells start at the user&apos;s role default. Click a cell to grant or deny it specifically for this user — overrides take priority over role permissions.
          </p>
        </div>
        {canEdit && (
          <button
            onClick={saveAll}
            disabled={saving || pendingChanges.size === 0}
            className="px-5 py-2 rounded-lg text-sm font-semibold text-white transition disabled:opacity-50"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            {saving ? 'Saving…' : pendingChanges.size > 0 ? `Save ${pendingChanges.size} change${pendingChanges.size !== 1 ? 's' : ''}` : 'Saved'}
          </button>
        )}
      </div>

      {alert && <div className="mb-4"><Alert type={alert.type} message={alert.message} /></div>}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-[560px]">
            {/* Header */}
            <div className="flex items-center bg-slate-100 border-b border-slate-200">
              <div className="flex-1 px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Feature</div>
              {ACTIONS.map(a => (
                <div key={a} className="w-16 text-center py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">{a}</div>
              ))}
            </div>
            {FEATURES.map(feature => (
              <FeatureSection
                key={feature.key}
                feature={feature}
                overrides={overrides}
                getDefault={getDefault}
                onChange={handleCellChange}
                disabled={!canEdit}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
