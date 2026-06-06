'use client';

import { useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { adminApi, type ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, SaveButton, Alert } from '@/components/ui/settings-card';

// ── Feature catalog ───────────────────────────────────────────────────────────

const FEATURE_CATALOG: Record<string, string[]> = {
  admissions:     ['application_stage', 'lead_tracking', 'inquiry_stage', 'interview_stage', 'acceptance_stage'],
  academics:      ['assessments', 'exams', 'grading', 'report_cards', 'transcripts'],
  attendance:     ['student_attendance', 'staff_attendance', 'attendance_analytics'],
  finance:        ['fee_structures', 'invoicing', 'receipts', 'outstanding_balance_tracking', 'discount_management', 'feeding_fees', 'transport_fees'],
  student_portal: ['attendance_view', 'notice_view', 'report_card_view', 'academic_progress_view', 'transport_view'],
  transport:      ['vehicles', 'routes', 'drivers', 'student_assignment', 'pickup_points'],
  communication:  ['notices', 'announcements', 'internal_messaging'],
};

const FEATURE_KEYS = Object.keys(FEATURE_CATALOG);

// ── Types ─────────────────────────────────────────────────────────────────────

type Grant = {
  id: string; featureKey: string; subFeatureKey: string | null;
  grantType: 'PERMANENT' | 'TEMPORARY'; expiresAt: string | null; createdAt: string;
};

type SchoolDetail = {
  id: string; name: string; country: string; subscriptionState: string; createdAt: string;
  package: { id: string; name: string } | null;
  schoolFeatures: { featureKey: string; state: string }[];
  schoolFeatureGrants: Grant[];
  _count: { users: number; students: number };
};

type Package = { id: string; name: string };

const STATES = ['TRIAL', 'ACTIVE', 'SUSPENDED', 'EXPIRED'];
const STATE_COLORS: Record<string, { bg: string; color: string }> = {
  ACTIVE:    { bg: '#f0fdf4', color: '#15803d' },
  TRIAL:     { bg: '#eff6ff', color: '#1d4ed8' },
  SUSPENDED: { bg: '#fef2f2', color: '#dc2626' },
  EXPIRED:   { bg: '#f8fafc', color: '#64748b' },
};

// ── Grant modal ───────────────────────────────────────────────────────────────

function GrantModal({ schoolId, open, onClose, onGranted }: {
  schoolId: string; open: boolean; onClose: () => void; onGranted: () => void;
}) {
  const [featureKey, setFeatureKey]       = useState('');
  const [subFeatureKey, setSubFeatureKey] = useState('');
  const [grantType, setGrantType]         = useState<'PERMANENT' | 'TEMPORARY'>('PERMANENT');
  const [expiresAt, setExpiresAt]         = useState('');
  const [saving, setSaving]               = useState(false);
  const [alert, setAlert]                 = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  const subOptions = featureKey ? FEATURE_CATALOG[featureKey] ?? [] : [];

  async function save() {
    if (!featureKey) { setAlert({ type: 'error', message: 'Please select a feature.' }); return; }
    if (grantType === 'TEMPORARY' && !expiresAt) {
      setAlert({ type: 'error', message: 'Expiry date is required for temporary grants.' }); return;
    }
    setSaving(true); setAlert(null);
    try {
      await adminApi.post(`/super-admin/schools/${schoolId}/grants`, {
        featureKey,
        subFeatureKey: subFeatureKey || null,
        grantType,
        expiresAt: grantType === 'TEMPORARY' ? expiresAt : null,
      });
      setFeatureKey(''); setSubFeatureKey(''); setGrantType('PERMANENT'); setExpiresAt('');
      onGranted();
      onClose();
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Failed to add grant.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add feature grant">
      <div className="space-y-4">
        {alert && <Alert type={alert.type} message={alert.message} />}

        <FormField label="Feature" required>
          <select
            value={featureKey}
            onChange={e => { setFeatureKey(e.target.value); setSubFeatureKey(''); }}
            className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">Select feature…</option>
            {FEATURE_KEYS.map(k => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </FormField>

        <FormField label="Sub-feature">
          <select
            value={subFeatureKey}
            onChange={e => setSubFeatureKey(e.target.value)}
            disabled={!featureKey}
            className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-40"
          >
            <option value="">Entire feature</option>
            {subOptions.map(k => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </FormField>

        <div>
          <p className="text-sm font-medium text-slate-700 mb-2">Grant type</p>
          <div className="flex gap-3">
            {(['PERMANENT', 'TEMPORARY'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setGrantType(t)}
                className="flex-1 py-2 rounded-lg text-sm font-medium border transition"
                style={
                  grantType === t
                    ? { backgroundColor: '#065f46', borderColor: '#065f46', color: '#fff' }
                    : { borderColor: '#e2e8f0', color: '#475569' }
                }
              >
                {t.charAt(0) + t.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        {grantType === 'TEMPORARY' && (
          <FormField label="Expires at" required>
            <Input
              type="date"
              value={expiresAt}
              onChange={e => setExpiresAt(e.target.value)}
            />
          </FormField>
        )}

        <div className="flex justify-end pt-2">
          <SaveButton loading={saving} onClick={save} label="Add grant" />
        </div>
      </div>
    </Modal>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminSchoolDetailPage() {
  const { id }  = useParams<{ id: string }>();
  const router  = useRouter();
  const [showGrantModal, setShowGrantModal] = useState(false);
  const [updatingState, setUpdatingState]   = useState(false);
  const [updatingPkg,   setUpdatingPkg]     = useState(false);
  const [alert, setAlert] = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  const fetchSchool   = useCallback(() => adminApi.get<SchoolDetail>(`/super-admin/schools/${id}`), [id]);
  const fetchPackages = useCallback(() => adminApi.get<Package[]>('/super-admin/packages'), []);

  const { data: school, loading, refetch } = useApi(fetchSchool);
  const { data: packages }                 = useApi(fetchPackages);

  async function changeState(state: string) {
    setUpdatingState(true); setAlert(null);
    try {
      await adminApi.patch(`/super-admin/schools/${id}/subscription`, { state });
      await refetch();
      setAlert({ type: 'success', message: 'Subscription state updated.' });
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Failed to update state.' });
    } finally {
      setUpdatingState(false);
    }
  }

  async function changePackage(packageId: string) {
    setUpdatingPkg(true); setAlert(null);
    try {
      await adminApi.patch(`/super-admin/schools/${id}/package/${packageId}`);
      await refetch();
      setAlert({ type: 'success', message: 'Package updated.' });
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Failed to update package.' });
    } finally {
      setUpdatingPkg(false);
    }
  }

  async function revokeGrant(grantId: string) {
    try {
      await adminApi.delete(`/super-admin/schools/${id}/grants/${grantId}`);
      await refetch();
    } catch {}
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[1,2,3].map(i => <div key={i} className="h-32 bg-slate-100 rounded-2xl animate-pulse" />)}
      </div>
    );
  }

  if (!school) return <p className="text-sm text-slate-500">School not found.</p>;

  const cfg = STATE_COLORS[school.subscriptionState] ?? STATE_COLORS.EXPIRED;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <button onClick={() => router.back()} className="text-xs text-slate-400 hover:text-slate-600 mb-2 transition">
            ← Back to schools
          </button>
          <h1 className="text-2xl font-bold text-slate-900">{school.name}</h1>
          <p className="text-sm text-slate-500 mt-1">{school.country} · Registered {new Date(school.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
        </div>
        <span className="text-xs font-semibold px-3 py-1.5 rounded-full mt-1"
          style={{ backgroundColor: cfg.bg, color: cfg.color }}>
          {school.subscriptionState.charAt(0) + school.subscriptionState.slice(1).toLowerCase()}
        </span>
      </div>

      {alert && <Alert type={alert.type} message={alert.message} />}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-4">
          <p className="text-xs text-slate-400 mb-1">Students</p>
          <p className="text-2xl font-bold text-slate-900">{school._count.students}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-4">
          <p className="text-xs text-slate-400 mb-1">Staff users</p>
          <p className="text-2xl font-bold text-slate-900">{school._count.users}</p>
        </div>
      </div>

      {/* Subscription state */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-5">
        <p className="text-sm font-semibold text-slate-700 mb-3">Subscription state</p>
        <div className="flex flex-wrap gap-2">
          {STATES.map(state => {
            const c = STATE_COLORS[state];
            const active = school.subscriptionState === state;
            return (
              <button key={state} onClick={() => !active && changeState(state)}
                disabled={updatingState || active}
                className="px-4 py-2 rounded-lg text-sm font-medium border transition disabled:opacity-60"
                style={active
                  ? { backgroundColor: c.bg, borderColor: c.color, color: c.color }
                  : { borderColor: '#e2e8f0', color: '#64748b' }}>
                {state.charAt(0) + state.slice(1).toLowerCase()}
              </button>
            );
          })}
        </div>
      </div>

      {/* Package */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-5">
        <p className="text-sm font-semibold text-slate-700 mb-3">
          Package
          {school.package && <span className="ml-2 text-xs font-normal text-slate-400">Current: {school.package.name}</span>}
        </p>
        <div className="flex flex-wrap gap-2">
          {packages?.map(pkg => {
            const active = school.package?.id === pkg.id;
            return (
              <button key={pkg.id} onClick={() => !active && changePackage(pkg.id)}
                disabled={updatingPkg || active}
                className="px-4 py-2 rounded-lg text-sm font-medium border transition disabled:opacity-60"
                style={active
                  ? { backgroundColor: '#f0fdf4', borderColor: '#15803d', color: '#15803d' }
                  : { borderColor: '#e2e8f0', color: '#64748b' }}>
                {pkg.name}
              </button>
            );
          })}
          {(!packages || packages.length === 0) && (
            <p className="text-sm text-slate-400">No packages configured yet.</p>
          )}
        </div>
      </div>

      {/* Feature grants */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-50 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700">A-la-carte feature grants</p>
          <button onClick={() => setShowGrantModal(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition">
            + Add grant
          </button>
        </div>
        <div className="divide-y divide-slate-50">
          {school.schoolFeatureGrants.map(grant => (
            <div key={grant.id} className="px-5 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-800">
                  {grant.featureKey}{grant.subFeatureKey ? ` / ${grant.subFeatureKey}` : ''}
                </p>
                <p className="text-xs text-slate-400">
                  {grant.grantType === 'PERMANENT'
                    ? 'Permanent'
                    : `Expires ${new Date(grant.expiresAt!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                </p>
              </div>
              <button onClick={() => revokeGrant(grant.id)}
                className="text-xs text-red-400 hover:text-red-600 transition">
                Revoke
              </button>
            </div>
          ))}
          {school.schoolFeatureGrants.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-slate-400">No grants added.</div>
          )}
        </div>
      </div>

      {/* Active features */}
      {school.schoolFeatures.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-50">
            <p className="text-sm font-semibold text-slate-700">Feature states</p>
          </div>
          <div className="divide-y divide-slate-50">
            {school.schoolFeatures.map(f => (
              <div key={f.featureKey} className="px-5 py-3 flex items-center justify-between">
                <p className="text-sm text-slate-700 font-mono">{f.featureKey}</p>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  f.state === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' :
                  f.state === 'AVAILABLE' ? 'bg-blue-50 text-blue-700' :
                  'bg-slate-100 text-slate-400'
                }`}>
                  {f.state.charAt(0) + f.state.slice(1).toLowerCase()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <GrantModal
        schoolId={id}
        open={showGrantModal}
        onClose={() => setShowGrantModal(false)}
        onGranted={refetch}
      />
    </div>
  );
}
