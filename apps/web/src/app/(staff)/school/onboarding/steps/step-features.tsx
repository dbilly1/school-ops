'use client';

import { useState } from 'react';
import { staffApi } from '@/lib/api';
import { WizardShell, WizardNav } from './wizard-shell';

// ── Feature definitions (UI metadata only — states come from API) ─────────────

const FEATURES = [
  {
    key: 'admissions',
    label: 'Admissions CRM',
    description: 'Track leads, applications, interviews, and enrol students through a configurable pipeline.',
    subFeatures: [
      { key: 'lead_tracking',      label: 'Lead tracking',       defaultOn: false },
      { key: 'inquiry_stage',      label: 'Inquiry stage',       defaultOn: false },
      { key: 'application_stage',  label: 'Application stage',   defaultOn: true  },
      { key: 'interview_stage',    label: 'Interview stage',     defaultOn: false },
      { key: 'acceptance_stage',   label: 'Acceptance stage',    defaultOn: true  },
    ],
  },
  {
    key: 'academics',
    label: 'Academics',
    description: 'Subjects, timetables, assessments, grading, and report cards.',
    subFeatures: [
      { key: 'assessments',  label: 'Assessments',  defaultOn: true  },
      { key: 'exams',        label: 'Exams',         defaultOn: true  },
      { key: 'grading',      label: 'Grading',       defaultOn: true  },
      { key: 'report_cards', label: 'Report cards',  defaultOn: true  },
      { key: 'transcripts',  label: 'Transcripts',   defaultOn: false },
    ],
  },
  {
    key: 'attendance',
    label: 'Attendance',
    description: 'Daily student and staff attendance tracking with analytics.',
    subFeatures: [
      { key: 'student_attendance',   label: 'Student attendance',   defaultOn: true  },
      { key: 'staff_attendance',     label: 'Staff attendance',     defaultOn: true  },
      { key: 'attendance_analytics', label: 'Attendance analytics', defaultOn: false },
    ],
  },
  {
    key: 'finance',
    label: 'Finance',
    description: 'Fee structures, invoicing, payment recording, and outstanding balances.',
    subFeatures: [
      { key: 'fee_structures',             label: 'Fee structures',             defaultOn: true  },
      { key: 'invoicing',                  label: 'Invoicing',                  defaultOn: true  },
      { key: 'receipts',                   label: 'Receipts',                   defaultOn: true  },
      { key: 'outstanding_balance_tracking', label: 'Outstanding balance tracking', defaultOn: true },
      { key: 'discount_management',        label: 'Discount management',        defaultOn: false },
    ],
  },
  {
    key: 'feeding_fees',
    label: 'Feeding Fees',
    description: 'Daily feeding fee collection, pre-payment tracking, and reconciliation.',
    subFeatures: [],
  },
  {
    key: 'transport',
    label: 'Transport',
    description: 'Manage vehicles, routes, drivers, and student transport assignments.',
    subFeatures: [
      { key: 'vehicles',          label: 'Vehicles',          defaultOn: true  },
      { key: 'routes',            label: 'Routes',            defaultOn: true  },
      { key: 'drivers',           label: 'Drivers',           defaultOn: true  },
      { key: 'student_assignment',label: 'Student assignment', defaultOn: true  },
      { key: 'pickup_points',     label: 'Pickup points',     defaultOn: false },
    ],
  },
  {
    key: 'communication',
    label: 'Communication',
    description: 'Notices, announcements, and internal messaging for staff.',
    subFeatures: [
      { key: 'notices',           label: 'Notices',           defaultOn: true  },
      { key: 'announcements',     label: 'Announcements',     defaultOn: true  },
      { key: 'internal_messaging',label: 'Internal messaging', defaultOn: false },
    ],
  },
];

type FeatureToggleState = Record<string, {
  active: boolean;
  subFeatures: Record<string, boolean>;
}>;

function buildDefaults(): FeatureToggleState {
  const state: FeatureToggleState = {};
  for (const f of FEATURES) {
    state[f.key] = {
      active: true,
      subFeatures: Object.fromEntries(f.subFeatures.map(sf => [sf.key, sf.defaultOn])),
    };
  }
  return state;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function StepFeatures({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const [toggles, setToggles] = useState<FeatureToggleState>(buildDefaults);
  const [saving, setSaving]   = useState(false);

  function toggleFeature(key: string) {
    setToggles(t => ({ ...t, [key]: { ...t[key], active: !t[key].active } }));
  }

  function toggleSubFeature(featureKey: string, subKey: string) {
    setToggles(t => ({
      ...t,
      [featureKey]: {
        ...t[featureKey],
        subFeatures: {
          ...t[featureKey].subFeatures,
          [subKey]: !t[featureKey].subFeatures[subKey],
        },
      },
    }));
  }

  async function handleContinue() {
    setSaving(true);
    try {
      await staffApi.post('/school/features/bulk-configure', {
        features: FEATURES.map(feature => ({
          featureKey: feature.key,
          active: toggles[feature.key].active,
          subFeatures: feature.subFeatures.map(sf => ({
            subFeatureKey: sf.key,
            enabled: toggles[feature.key].subFeatures[sf.key],
          })),
        })),
      });
    } catch {
      // Non-fatal — proceed to next step regardless
    } finally {
      setSaving(false);
      onNext();
    }
  }

  return (
    <WizardShell
      title="Choose your features"
      description="Select the modules your school will use. You can change these at any time from Settings."
      footer={<WizardNav onSkip={onSkip} onNext={handleContinue} loading={saving} nextLabel="Save & continue" />}
    >
      <div className="space-y-3">
        {FEATURES.map(feature => {
          const toggle = toggles[feature.key];

          return (
            <div
              key={feature.key}
              className={`border rounded-xl overflow-hidden transition-all ${
                toggle.active ? 'border-slate-200' : 'border-slate-100 opacity-50'
              }`}
            >
              {/* Feature header row */}
              <div className="flex items-start gap-4 px-4 py-3.5">
                {/* Toggle */}
                <button
                  type="button"
                  onClick={() => toggleFeature(feature.key)}
                  className="mt-0.5 relative w-9 h-5 rounded-full transition-colors shrink-0 bg-slate-200"
                  style={toggle.active ? { backgroundColor: 'var(--accent)' } : {}}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${
                      toggle.active ? 'translate-x-4' : ''
                    }`}
                  />
                </button>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{feature.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{feature.description}</p>
                </div>
              </div>

              {/* Sub-features — always visible when feature is active */}
              {toggle.active && feature.subFeatures.length > 0 && (
                <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2.5">
                    Capabilities
                  </p>
                  <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                    {feature.subFeatures.map(sf => (
                      <label key={sf.key} className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={toggle.subFeatures[sf.key]}
                          onChange={() => toggleSubFeature(feature.key, sf.key)}
                          className="w-4 h-4 rounded border-slate-300 accent-emerald-800 shrink-0"
                        />
                        <span className="text-sm text-slate-700">{sf.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </WizardShell>
  );
}
