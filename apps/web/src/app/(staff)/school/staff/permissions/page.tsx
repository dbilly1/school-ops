'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { staffApi, type ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { useStaffAuth } from '@/contexts/staff-auth';
import { clearPermissionCache } from '@/hooks/use-permission';
import { MANAGEABLE_ROLES } from '@/lib/staff-roles';
import { Alert } from '@/components/ui/settings-card';

// ── Constants ─────────────────────────────────────────────────────────────────

const ACTIONS = ['VIEW', 'CREATE', 'EDIT', 'DELETE'] as const;
type Action = typeof ACTIONS[number];

const ROLES = MANAGEABLE_ROLES;

const FEATURES = [
  { key: 'admissions',    label: 'Admissions',    subFeatures: [
    { key: 'lead_tracking',     label: 'Lead tracking'     },
    { key: 'inquiry_stage',     label: 'Inquiry stage'     },
    { key: 'application_stage', label: 'Application stage' },
    { key: 'interview_stage',   label: 'Interview stage'   },
    { key: 'acceptance_stage',  label: 'Acceptance stage'  },
  ]},
  { key: 'academics',     label: 'Academics',     subFeatures: [
    { key: 'assessments',  label: 'Assessments'  },
    { key: 'exams',        label: 'Exams'        },
    { key: 'grading',      label: 'Grading'      },
    { key: 'report_cards', label: 'Report cards' },
    { key: 'transcripts',  label: 'Transcripts'  },
    { key: 'lesson_notes', label: 'Lesson notes' },
    { key: 'lesson_note_review', label: 'Lesson note review' },
  ]},
  { key: 'attendance',    label: 'Attendance',    subFeatures: [
    { key: 'student_attendance',   label: 'Student attendance'   },
    { key: 'staff_attendance',     label: 'Staff attendance'     },
    { key: 'attendance_analytics', label: 'Attendance analytics' },
  ]},
  { key: 'finance',       label: 'Finance',       subFeatures: [
    { key: 'fee_structures',               label: 'Fee structures'               },
    { key: 'invoicing',                    label: 'Invoicing'                    },
    { key: 'receipts',                     label: 'Receipts'                     },
    { key: 'outstanding_balance_tracking', label: 'Outstanding balance tracking' },
    { key: 'discount_management',          label: 'Discount management'          },
    { key: 'expense_management',           label: 'Expense management'           },
  ]},
  { key: 'feeding_fees',  label: 'Feeding Fees',  subFeatures: [
    { key: 'fee_collection',     label: 'Daily fee collection' },
  ]},
  { key: 'transport',     label: 'Transport',     subFeatures: [
    { key: 'vehicles',           label: 'Vehicles'           },
    { key: 'routes',             label: 'Routes'             },
    { key: 'drivers',            label: 'Drivers'            },
    { key: 'student_assignment', label: 'Student assignment' },
    { key: 'pickup_points',      label: 'Pickup points'      },
    { key: 'fee_collection',     label: 'Daily fee collection' },
  ]},
  { key: 'communication', label: 'Communication', subFeatures: [
    { key: 'notices',             label: 'Notices'             },
    { key: 'announcements',       label: 'Announcements'       },
    { key: 'internal_messaging',  label: 'Internal messaging'  },
  ]},
  { key: 'students', label: 'Students', subFeatures: [] },
  { key: 'staff',    label: 'Staff',    subFeatures: [] },
  { key: 'reports',  label: 'Reports',  subFeatures: [] },
];

// ── Types ─────────────────────────────────────────────────────────────────────

type OverrideState = 'granted' | 'denied' | 'default';

type PermissionDefault = {
  role: string;
  featureKey: string;
  subFeatureKey: string | null;
  action: Action;
  allowed: boolean;
};

type PermissionOverride = {
  id: string;
  role: string;
  featureKey: string;
  subFeatureKey: string | null;
  action: Action;
  granted: boolean;
};

// key = "featureKey:subFeatureKey:action"
type OverrideMap = Map<string, OverrideState>;

function makeKey(featureKey: string, subFeatureKey: string | null, action: Action) {
  return `${featureKey}:${subFeatureKey ?? ''}:${action}`;
}

function parseKey(key: string): { featureKey: string; subFeatureKey: string | null; action: Action } {
  const [featureKey, sub, action] = key.split(':');
  return { featureKey, subFeatureKey: sub || null, action: action as Action };
}

// ── Action cell ───────────────────────────────────────────────────────────────

function ActionCell({
  defaultAllowed, state, onChange, disabled,
}: {
  defaultAllowed: boolean;
  state: OverrideState;
  onChange: (next: OverrideState) => void;
  disabled: boolean;
}) {
  function cycle() {
    if (disabled) return;
    // default → flip the default → other flip → back to default
    const next: OverrideState =
      state === 'default'  ? (defaultAllowed ? 'denied' : 'granted')
      : state === 'granted' ? 'denied'
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
          ? isOverridden
            ? { backgroundColor: 'var(--accent)', color: '#fff' }
            : { backgroundColor: '#d1fae5', color: '#065f46' }
          : isOverridden
            ? { backgroundColor: '#fee2e2', color: '#dc2626' }
            : { backgroundColor: '#f8fafc', color: '#cbd5e1' }
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

function FeatureSection({ feature, overrides, defaults, onChange, disabled }: {
  feature: typeof FEATURES[number];
  overrides: OverrideMap;
  defaults: PermissionDefault[];
  onChange: (key: string, state: OverrideState) => void;
  disabled: boolean;
}) {
  const [expanded, setExpanded] = useState(true);

  function getDefault(featureKey: string, subFeatureKey: string | null, action: Action): boolean {
    return defaults.find(
      d => d.featureKey === featureKey && d.subFeatureKey === subFeatureKey && d.action === action,
    )?.allowed ?? false;
  }

  function getState(featureKey: string, subFeatureKey: string | null, action: Action): OverrideState {
    return overrides.get(makeKey(featureKey, subFeatureKey, action)) ?? 'default';
  }

  const rows = [
    { featureKey: feature.key, subFeatureKey: null as string | null, label: feature.label, isParent: true },
    ...feature.subFeatures.map(sf => ({
      featureKey: feature.key, subFeatureKey: sf.key, label: sf.label, isParent: false,
    })),
  ];

  return (
    <div className="border-b border-slate-100 last:border-0">
      {rows.map((row) => {
        if (!row.isParent && !expanded) return null;
        return (
          <div
            key={`${row.featureKey}:${row.subFeatureKey}`}
            className={`flex items-center ${row.isParent ? 'bg-slate-50' : ''}`}
          >
            <div className={`flex-1 px-4 py-2.5 text-sm flex items-center gap-2 ${row.isParent ? 'font-semibold text-slate-700' : 'text-slate-600 pl-8'}`}>
              {row.isParent && feature.subFeatures.length > 0 && (
                <button type="button" onClick={() => setExpanded(e => !e)}
                  className="text-slate-400 hover:text-slate-700 transition text-xs w-4">
                  {expanded ? '▾' : '▸'}
                </button>
              )}
              {(row.isParent && feature.subFeatures.length === 0) && <span className="w-4" />}
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RolePermissionsPage() {
  const router = useRouter();
  const { isOwner, isAdmin } = useStaffAuth();
  const [selectedRole, setSelectedRole] = useState(ROLES[0].value);
  const [overrides, setOverrides]           = useState<OverrideMap>(new Map());
  const [pendingChanges, setPendingChanges] = useState<Map<string, OverrideState>>(new Map());
  const [saving, setSaving]   = useState(false);
  const [alert, setAlert]     = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  // Owner-only toggle — loaded from server
  const [adminCanManage, setAdminCanManage] = useState(true);
  const [savingToggle, setSavingToggle]     = useState(false);

  // Load school settings (adminCanManagePermissions)
  const fetchSettings = useCallback(() => staffApi.get<{ adminCanManagePermissions: boolean }>('/school/profile/settings'), []);
  const { data: settings } = useApi(fetchSettings);
  useEffect(() => {
    if (settings) setAdminCanManage(settings.adminCanManagePermissions);
  }, [settings]);

  // Load defaults (global, not school-specific)
  const fetchDefaults = useCallback(() => staffApi.get<PermissionDefault[]>('/school/permissions/defaults'), []);
  const { data: defaults } = useApi(fetchDefaults);

  // Load overrides for selected role
  const fetchOverrides = useCallback(
    () => staffApi.get<PermissionOverride[]>(`/school/users/overrides/roles/${selectedRole}`),
    [selectedRole],
  );
  const { data: roleOverrides, refetch: refetchOverrides } = useApi(fetchOverrides);

  // Rebuild override map when data loads / role changes
  useEffect(() => {
    const map: OverrideMap = new Map();
    roleOverrides?.forEach(o => {
      map.set(makeKey(o.featureKey, o.subFeatureKey, o.action), o.granted ? 'granted' : 'denied');
    });
    setOverrides(map);
    setPendingChanges(new Map());
  }, [roleOverrides]);

  function handleCellChange(key: string, state: OverrideState) {
    setPendingChanges(m => { const n = new Map(m); n.set(key, state); return n; });
    setOverrides(m => { const n = new Map(m); n.set(key, state); return n; });
  }

  async function saveAll() {
    if (pendingChanges.size === 0) return;
    setAlert(null); setSaving(true);
    try {
      const promises: Promise<unknown>[] = [];

      pendingChanges.forEach((state, key) => {
        const { featureKey, subFeatureKey, action } = parseKey(key);

        if (state === 'default') {
          // Remove the override entirely
          const params = new URLSearchParams({
            role: selectedRole,
            featureKey,
            action,
            ...(subFeatureKey ? { subFeatureKey } : {}),
          });
          promises.push(
            staffApi.delete(`/school/users/overrides/roles?${params.toString()}`),
          );
        } else {
          promises.push(
            staffApi.post('/school/users/overrides/roles', {
              role: selectedRole,
              featureKey,
              subFeatureKey: subFeatureKey || null,
              action,
              granted: state === 'granted',
            }),
          );
        }
      });

      await Promise.all(promises);
      setPendingChanges(new Map());
      clearPermissionCache(); // overrides changed — drop cached can() results so gates re-resolve
      setAlert({ type: 'success', message: 'Permission overrides saved.' });
      refetchOverrides();
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Failed to save.' });
    } finally {
      setSaving(false);
    }
  }

  // canEdit: owners always can; admins only if the toggle permits
  const canEdit = isOwner || (isAdmin && adminCanManage);
  const hasPending = pendingChanges.size > 0;

  return (
    <div>
      {/* Back */}
      <button onClick={() => router.push('/school/staff')}
        className="text-sm text-slate-400 hover:text-slate-700 transition mb-5 flex items-center gap-1">
        ← Back to staff
      </button>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Role Permissions</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Override default permissions per role. Click any cell to cycle.{' '}
            <span className="text-slate-400">Coloured = overridden from default.</span>
          </p>
        </div>
        {hasPending && (
          <button
            onClick={saveAll}
            disabled={saving}
            className="px-5 py-2 rounded-lg text-sm font-semibold text-white transition disabled:opacity-50"
            style={{ backgroundColor: 'var(--accent)' }}
            onMouseEnter={e => !saving && (e.currentTarget.style.backgroundColor = 'var(--accent-hover)')}
            onMouseLeave={e => !saving && (e.currentTarget.style.backgroundColor = 'var(--accent)')}
          >
            {saving ? 'Saving…' : `Save ${pendingChanges.size} change${pendingChanges.size > 1 ? 's' : ''}`}
          </button>
        )}
      </div>

      {alert && <div className="mb-4"><Alert type={alert.type} message={alert.message} /></div>}

      {/* Owner-only: admin permission management toggle */}
      {isOwner && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-4 mb-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-800">Allow School Admin to manage permission overrides</p>
            <p className="text-xs text-slate-400 mt-0.5">
              When off, only you (the School Owner) can edit role and user permission overrides.
            </p>
          </div>
          <button
            type="button"
            onClick={async () => {
              setSavingToggle(true);
              try {
                await staffApi.patch('/school/profile/settings/admin-permission-toggle', { allowed: !adminCanManage });
                setAdminCanManage(v => !v);
              } catch {
                // silently ignore — toggle reverts visually on next settings load
              } finally {
                setSavingToggle(false);
              }
            }}
            disabled={savingToggle}
            className="relative w-10 h-6 rounded-full transition-colors shrink-0 disabled:opacity-50"
            style={adminCanManage ? { backgroundColor: 'var(--accent)' } : { backgroundColor: '#e2e8f0' }}
          >
            <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${adminCanManage ? 'translate-x-4' : ''}`} />
          </button>
        </div>
      )}

      {/* Admin notice when they can't edit */}
      {isAdmin && !isOwner && !adminCanManage && (
        <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-100 rounded-xl text-sm text-amber-700">
          The School Owner has restricted permission management to owner-only.
        </div>
      )}

      {/* Role selector */}
      <div className="flex gap-2 mb-4">
        {ROLES.map(r => (
          <button
            key={r.value}
            onClick={() => setSelectedRole(r.value)}
            className="px-4 py-2 rounded-xl text-sm font-medium border transition"
            style={
              selectedRole === r.value
                ? { backgroundColor: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff' }
                : { borderColor: '#e2e8f0', color: '#475569' }
            }
          >
            {r.label}
          </button>
        ))}
      </div>

      <p className="text-xs text-slate-400 mb-4 -mt-1">
        Owner, Admin and Headmaster aren&rsquo;t listed — they have built-in access that isn&rsquo;t
        managed here (Headmaster has full academic access; Owner and Admin have everything).
      </p>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-3 text-xs text-slate-400 flex-wrap">
        <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded bg-emerald-100" /> Default allow</div>
        <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded bg-slate-100" /> Default deny</div>
        <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded" style={{ backgroundColor: 'var(--accent)' }} /> Override: allow</div>
        <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded bg-red-100" /> Override: deny</div>
      </div>

      {/* Matrix */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {/* Column headers */}
        <div className="flex items-center border-b border-slate-100 bg-slate-50">
          <div className="flex-1 px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">
            Feature / Sub-feature
          </div>
          {ACTIONS.map(a => (
            <div key={a} className="w-16 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide py-2.5">
              {a[0] + a.slice(1).toLowerCase()}
            </div>
          ))}
        </div>

        {FEATURES.map(feature => (
          <FeatureSection
            key={feature.key}
            feature={feature}
            overrides={overrides}
            defaults={defaults?.filter(d => d.role === selectedRole) ?? []}
            onChange={handleCellChange}
            disabled={!canEdit}
          />
        ))}
      </div>

      {!canEdit && !isAdmin && (
        <p className="mt-3 text-sm text-slate-400 text-center">
          You do not have permission to modify role overrides.
        </p>
      )}
    </div>
  );
}
