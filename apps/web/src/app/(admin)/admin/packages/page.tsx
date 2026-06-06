'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { Package, School } from 'lucide-react';
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

type FeatureEntry = { featureKey: string; subFeatureKey: string | null };

type PackageListItem = {
  id: string; name: string; description: string | null; isActive: boolean; createdAt: string;
  features: { id: string; featureKey: string; subFeatureKey: string | null }[];
  _count: { schools: number };
};

// ── Feature row inside the create dialog ─────────────────────────────────────

function FeatureRow({
  entry,
  onRemove,
}: {
  entry: FeatureEntry;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
      <span className="text-xs font-mono text-slate-700 flex-1">
        {entry.featureKey}
        {entry.subFeatureKey && (
          <span className="text-slate-400"> / {entry.subFeatureKey}</span>
        )}
      </span>
      <button
        onClick={onRemove}
        className="text-slate-300 hover:text-red-400 text-xs leading-none transition"
      >
        ✕
      </button>
    </div>
  );
}

// ── Feature adder inside the create dialog ────────────────────────────────────

function FeatureAdder({ onAdd }: { onAdd: (entry: FeatureEntry) => void }) {
  const [featureKey, setFeatureKey]     = useState('');
  const [subFeatureKey, setSubFeatureKey] = useState('');

  const subOptions = featureKey ? FEATURE_CATALOG[featureKey] ?? [] : [];

  function handleAdd() {
    if (!featureKey) return;
    onAdd({ featureKey, subFeatureKey: subFeatureKey || null });
    setFeatureKey('');
    setSubFeatureKey('');
  }

  return (
    <div className="flex items-end gap-2">
      <div className="flex-1">
        <label className="block text-xs font-medium text-slate-600 mb-1">Feature</label>
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
      </div>

      <div className="flex-1">
        <label className="block text-xs font-medium text-slate-600 mb-1">
          Sub-feature <span className="text-slate-400 font-normal">(optional)</span>
        </label>
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
      </div>

      <button
        onClick={handleAdd}
        disabled={!featureKey}
        className="px-3 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-40 transition shrink-0"
      >
        Add
      </button>
    </div>
  );
}

// ── Create package modal ──────────────────────────────────────────────────────

function CreatePackageModal({
  open, onClose, onCreated,
}: {
  open: boolean; onClose: () => void; onCreated: () => void;
}) {
  const [name, setName]           = useState('');
  const [description, setDesc]    = useState('');
  const [features, setFeatures]   = useState<FeatureEntry[]>([]);
  const [saving, setSaving]       = useState(false);
  const [alert, setAlert]         = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  function addFeature(entry: FeatureEntry) {
    // Deduplicate
    const key = `${entry.featureKey}|${entry.subFeatureKey ?? ''}`;
    if (features.some(f => `${f.featureKey}|${f.subFeatureKey ?? ''}` === key)) return;
    setFeatures(prev => [...prev, entry]);
  }

  function removeFeature(idx: number) {
    setFeatures(prev => prev.filter((_, i) => i !== idx));
  }

  async function save() {
    if (!name.trim()) { setAlert({ type: 'error', message: 'Package name is required.' }); return; }
    setSaving(true); setAlert(null);
    try {
      const pkg = await adminApi.post<{ id: string }>(
        '/super-admin/packages',
        { name: name.trim(), description: description.trim() || null },
      );

      // Add all selected features in parallel
      if (features.length > 0) {
        await Promise.all(
          features.map(f =>
            adminApi.post(`/super-admin/packages/${pkg.id}/features`, {
              featureKey: f.featureKey,
              subFeatureKey: f.subFeatureKey,
            }),
          ),
        );
      }

      setName(''); setDesc(''); setFeatures([]);
      onCreated();
      onClose();
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Failed to create package.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create package">
      <div className="space-y-5">
        {alert && <Alert type={alert.type} message={alert.message} />}

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Package name" required>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Starter, Standard, Premium"
            />
          </FormField>
          <FormField label="Description">
            <Input
              value={description}
              onChange={e => setDesc(e.target.value)}
              placeholder="Optional short description"
            />
          </FormField>
        </div>

        {/* Feature builder */}
        <div>
          <p className="text-sm font-semibold text-slate-700 mb-3">Features</p>
          <FeatureAdder onAdd={addFeature} />

          {features.length > 0 && (
            <div className="mt-3 space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {features.map((f, i) => (
                <FeatureRow key={i} entry={f} onRemove={() => removeFeature(i)} />
              ))}
            </div>
          )}

          {features.length === 0 && (
            <p className="mt-2 text-xs text-slate-400">
              No features added yet. You can also add them later from the package detail page.
            </p>
          )}
        </div>

        <div className="flex justify-end pt-1">
          <SaveButton loading={saving} onClick={save} label="Create package" />
        </div>
      </div>
    </Modal>
  );
}

// ── Package card ──────────────────────────────────────────────────────────────

function PackageCard({ pkg }: { pkg: PackageListItem }) {
  const topLevel  = pkg.features.filter(f => f.subFeatureKey === null);
  const subFCount = pkg.features.filter(f => f.subFeatureKey !== null).length;

  // Group feature keys for display
  const featureKeys = [...new Set(pkg.features.map(f => f.featureKey))];

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
      <div className="px-5 py-5 flex-1">
        <div className="flex items-start justify-between mb-2">
          <h3 className="text-base font-bold text-slate-900">{pkg.name}</h3>
          <span
            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ml-3 ${
              pkg.isActive
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-slate-100 text-slate-400'
            }`}
          >
            {pkg.isActive ? 'Active' : 'Inactive'}
          </span>
        </div>

        {pkg.description && (
          <p className="text-xs text-slate-400 mb-3">{pkg.description}</p>
        )}

        {/* Feature tags */}
        {featureKeys.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {featureKeys.map(k => (
              <span
                key={k}
                className="text-[11px] font-mono px-2 py-0.5 bg-slate-50 border border-slate-100 rounded-full text-slate-600"
              >
                {k}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-400 mt-3 italic">No features configured.</p>
        )}
      </div>

      <div className="px-5 py-3 border-t border-slate-50 bg-slate-50/50 flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span className="flex items-center gap-1">
            <School size={12} />
            {pkg._count.schools} school{pkg._count.schools !== 1 ? 's' : ''}
          </span>
          {topLevel.length > 0 && <span>· {topLevel.length} features · {subFCount} sub-features</span>}
        </div>
        <Link
          href={`/admin/packages/${pkg.id}`}
          className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 transition"
        >
          Manage →
        </Link>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminPackagesPage() {
  const [showCreate, setShowCreate] = useState(false);

  const fetchPackages = useCallback(
    () => adminApi.get<PackageListItem[]>('/super-admin/packages'),
    [],
  );
  const { data: packages, loading, refetch } = useApi(fetchPackages);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Packages</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage subscription packages and their feature sets.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition"
        >
          + New package
        </button>
      </div>

      {loading && (
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-48 bg-slate-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      )}

      {!loading && (
        <>
          {packages && packages.length > 0 ? (
            <div className="grid grid-cols-2 gap-4">
              {packages.map(pkg => (
                <PackageCard key={pkg.id} pkg={pkg} />
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-100 px-5 py-20 text-center flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center">
                <Package size={22} className="text-slate-400" />
              </div>
              <p className="text-sm font-semibold text-slate-700">No packages yet</p>
              <p className="text-xs text-slate-400">
                Create a package to define what features schools can access.
              </p>
            </div>
          )}
        </>
      )}

      <CreatePackageModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={refetch}
      />
    </div>
  );
}
