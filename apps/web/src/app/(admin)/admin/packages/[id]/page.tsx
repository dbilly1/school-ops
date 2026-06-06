'use client';

import { useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { adminApi, type ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { Puzzle } from 'lucide-react';
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

type PackageFeature = { id: string; featureKey: string; subFeatureKey: string | null };
type PackageDetail  = {
  id: string; name: string; description: string | null; isActive: boolean;
  features: PackageFeature[];
  _count: { schools: number };
};

function groupFeatures(features: PackageFeature[]) {
  const map = new Map<string, string[]>();
  for (const f of features) {
    if (f.subFeatureKey === null) {
      if (!map.has(f.featureKey)) map.set(f.featureKey, []);
    } else {
      const subs = map.get(f.featureKey) ?? [];
      subs.push(f.subFeatureKey);
      map.set(f.featureKey, subs);
    }
  }
  return map;
}

// ── Add feature modal ─────────────────────────────────────────────────────────

function AddFeatureModal({
  packageId, open, onClose, onAdded,
}: {
  packageId: string; open: boolean; onClose: () => void; onAdded: () => void;
}) {
  const [featureKey, setFeatureKey]       = useState('');
  const [subFeatureKey, setSubFeatureKey] = useState('');
  const [saving, setSaving]               = useState(false);
  const [alert, setAlert]                 = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  const subOptions = featureKey ? FEATURE_CATALOG[featureKey] ?? [] : [];

  async function save() {
    if (!featureKey) { setAlert({ type: 'error', message: 'Please select a feature.' }); return; }
    setSaving(true); setAlert(null);
    try {
      await adminApi.post(`/super-admin/packages/${packageId}/features`, {
        featureKey,
        subFeatureKey: subFeatureKey || null,
      });
      setFeatureKey(''); setSubFeatureKey('');
      onAdded();
      onClose();
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Failed to add feature.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add feature to package">
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
            <option value="">Entire feature (no sub-feature restriction)</option>
            {subOptions.map(k => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </FormField>

        <p className="text-xs text-slate-400">
          Leave sub-feature blank to include the entire feature. Select a sub-feature to grant access to that specific capability only.
        </p>

        <div className="flex justify-end pt-2">
          <SaveButton loading={saving} onClick={save} label="Add feature" />
        </div>
      </div>
    </Modal>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminPackageDetailPage() {
  const { id }  = useParams<{ id: string }>();
  const router  = useRouter();
  const [showAdd, setShowAdd]   = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [editName, setEditName] = useState(false);
  const [name, setName]         = useState('');
  const [saving, setSaving]     = useState(false);
  const [alert, setAlert]       = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  const fetchPackage = useCallback(
    () => adminApi.get<PackageDetail>(`/super-admin/packages/${id}`),
    [id],
  );
  const { data: pkg, loading, refetch } = useApi(fetchPackage);

  async function removeFeature(featureId: string) {
    setRemoving(featureId);
    try {
      await adminApi.delete(`/super-admin/packages/${id}/features/${featureId}`);
      await refetch();
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Failed to remove feature.' });
    } finally {
      setRemoving(null);
    }
  }

  async function saveName() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await adminApi.patch(`/super-admin/packages/${id}`, { name: name.trim() });
      await refetch();
      setEditName(false);
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Failed to update.' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-24 bg-slate-100 rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }
  if (!pkg) return <p className="text-sm text-slate-500">Package not found.</p>;

  const grouped = groupFeatures(pkg.features);

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <button
          onClick={() => router.back()}
          className="text-xs text-slate-400 hover:text-slate-600 mb-2 transition"
        >
          ← Back to packages
        </button>

        <div className="flex items-center gap-3">
          {editName ? (
            <div className="flex items-center gap-2 flex-1">
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                className="flex-1 px-3 py-1.5 text-xl font-bold bg-white border border-slate-200 rounded-lg text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500"
                autoFocus
              />
              <button
                onClick={saveName}
                disabled={saving}
                className="px-3 py-1.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-60 transition"
              >
                {saving ? '…' : 'Save'}
              </button>
              <button
                onClick={() => setEditName(false)}
                className="px-3 py-1.5 text-sm text-slate-400 hover:text-slate-600 transition"
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-slate-900">{pkg.name}</h1>
              <button
                onClick={() => { setName(pkg.name); setEditName(true); }}
                className="text-xs text-slate-400 hover:text-slate-600 transition mt-1"
              >
                Rename
              </button>
            </>
          )}
        </div>

        <p className="text-sm text-slate-500 mt-1">
          {pkg._count.schools} school{pkg._count.schools !== 1 ? 's' : ''} on this package
          {pkg.description && <span className="text-slate-400"> · {pkg.description}</span>}
        </p>
      </div>

      {alert && <Alert type={alert.type} message={alert.message} />}

      {/* Features */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-50 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-700">Features</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {[...grouped.keys()].length} top-level · {pkg.features.filter(f => f.subFeatureKey).length} sub-features
            </p>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition"
          >
            + Add feature
          </button>
        </div>

        {grouped.size === 0 ? (
          <div className="px-5 py-14 text-center flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center">
              <Puzzle size={20} className="text-slate-400" />
            </div>
            <p className="text-sm font-semibold text-slate-600">No features yet</p>
            <p className="text-xs text-slate-400">
              Add features to define what schools on this package can access.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {[...grouped.entries()].map(([featureKey, subKeys]) => {
              const topEntry = pkg.features.find(
                f => f.featureKey === featureKey && f.subFeatureKey === null,
              );
              return (
                <div key={featureKey} className="px-5 py-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-slate-800 font-mono">{featureKey}</p>
                    {topEntry && (
                      <button
                        onClick={() => removeFeature(topEntry.id)}
                        disabled={removing === topEntry.id}
                        className="text-xs text-red-400 hover:text-red-600 disabled:opacity-40 transition"
                      >
                        {removing === topEntry.id ? '…' : 'Remove'}
                      </button>
                    )}
                  </div>

                  {subKeys.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 ml-3">
                      {subKeys.map(subKey => {
                        const entry = pkg.features.find(
                          f => f.featureKey === featureKey && f.subFeatureKey === subKey,
                        );
                        return (
                          <div
                            key={subKey}
                            className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-0.5 bg-slate-50 border border-slate-100 rounded-full"
                          >
                            <span className="text-xs text-slate-600 font-mono">{subKey}</span>
                            {entry && (
                              <button
                                onClick={() => removeFeature(entry.id)}
                                disabled={removing === entry.id}
                                className="text-[10px] text-slate-300 hover:text-red-400 disabled:opacity-40 transition leading-none"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AddFeatureModal
        packageId={id}
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onAdded={refetch}
      />
    </div>
  );
}
