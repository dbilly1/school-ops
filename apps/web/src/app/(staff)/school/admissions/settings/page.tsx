'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { staffApi, type ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { SaveButton, Alert } from '@/components/ui/settings-card';
import { AdmissionLetterTemplateCard } from '@/components/admissions/admission-letter-template-card';
import { useStaffAuth } from '@/contexts/staff-auth';

// ── Types ─────────────────────────────────────────────────────────────────────

type FieldConfig = {
  id: string;
  fieldKey: string;
  label: string;
  fieldType: 'text' | 'email' | 'phone' | 'date' | 'select' | 'textarea';
  isRequired: boolean;
  isHidden: boolean;
  carryToProfile: boolean;
  position: number;
};

// Default fields that always exist — school can configure but not remove
const DEFAULT_FIELDS: Omit<FieldConfig, 'id'>[] = [
  { fieldKey: 'firstName',   label: 'First name',    fieldType: 'text',     isRequired: true,  isHidden: false, carryToProfile: true,  position: 1 },
  { fieldKey: 'lastName',    label: 'Last name',     fieldType: 'text',     isRequired: true,  isHidden: false, carryToProfile: true,  position: 2 },
  { fieldKey: 'dateOfBirth', label: 'Date of birth', fieldType: 'date',     isRequired: false, isHidden: false, carryToProfile: true,  position: 3 },
  { fieldKey: 'gender',      label: 'Gender',        fieldType: 'select',   isRequired: false, isHidden: false, carryToProfile: true,  position: 4 },
  { fieldKey: 'email',       label: 'Email',         fieldType: 'email',    isRequired: false, isHidden: false, carryToProfile: true,  position: 5 },
  { fieldKey: 'phone',       label: 'Phone',         fieldType: 'phone',    isRequired: false, isHidden: false, carryToProfile: false, position: 6 },
  { fieldKey: 'address',     label: 'Address',       fieldType: 'textarea', isRequired: false, isHidden: false, carryToProfile: true,  position: 7 },
  { fieldKey: 'source',      label: 'How they heard about us', fieldType: 'text', isRequired: false, isHidden: false, carryToProfile: false, position: 8 },
  { fieldKey: 'notes',       label: 'Notes',         fieldType: 'textarea', isRequired: false, isHidden: false, carryToProfile: false, position: 9 },
];

const FIELD_TYPE_LABELS: Record<string, string> = {
  text: 'Text', email: 'Email', phone: 'Phone',
  date: 'Date', select: 'Dropdown', textarea: 'Long text',
};

// ── Field row ─────────────────────────────────────────────────────────────────

function FieldRow({ field, onChange, onMoveUp, onMoveDown, isFirst, isLast, saving }: {
  field: Omit<FieldConfig, 'id'>;
  onChange: (updated: Omit<FieldConfig, 'id'>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
  saving: boolean;
}) {
  const coreFields = ['firstName', 'lastName'];
  const isCore = coreFields.includes(field.fieldKey);

  return (
    <tr className="border-b border-slate-50 last:border-0">
      {/* Order */}
      <td className="px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <button onClick={onMoveUp} disabled={isFirst || saving} className="text-slate-300 hover:text-slate-600 disabled:opacity-20 text-xs leading-none">▲</button>
          <button onClick={onMoveDown} disabled={isLast || saving} className="text-slate-300 hover:text-slate-600 disabled:opacity-20 text-xs leading-none">▼</button>
        </div>
      </td>

      {/* Label */}
      <td className="px-4 py-3">
        <input
          value={field.label}
          onChange={e => onChange({ ...field, label: e.target.value })}
          disabled={isCore}
          className="text-sm font-medium text-slate-800 border-none outline-none bg-transparent w-full disabled:opacity-60"
        />
      </td>

      {/* Type */}
      <td className="px-4 py-3">
        <span className="text-xs text-slate-400">{FIELD_TYPE_LABELS[field.fieldType] ?? field.fieldType}</span>
      </td>

      {/* Required */}
      <td className="px-4 py-3 text-center">
        <input
          type="checkbox"
          checked={field.isRequired}
          onChange={e => onChange({ ...field, isRequired: e.target.checked })}
          disabled={isCore}
          className="w-4 h-4 rounded"
        />
      </td>

      {/* Hidden */}
      <td className="px-4 py-3 text-center">
        <input
          type="checkbox"
          checked={field.isHidden}
          onChange={e => onChange({ ...field, isHidden: isCore ? false : e.target.checked })}
          disabled={isCore}
          className="w-4 h-4 rounded"
        />
      </td>

      {/* Carry to profile */}
      <td className="px-4 py-3 text-center">
        <input
          type="checkbox"
          checked={field.carryToProfile}
          onChange={e => onChange({ ...field, carryToProfile: e.target.checked })}
          className="w-4 h-4 rounded"
        />
      </td>
    </tr>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdmissionSettingsPage() {
  const router = useRouter();
  const { isOwner, isAdmin } = useStaffAuth();

  const fetchFields = useCallback(() =>
    staffApi.get<FieldConfig[]>('/school/admissions/field-config').catch(() => []),
    [],
  );
  const { data: serverFields, loading } = useApi(fetchFields);

  // Merge server fields with defaults
  const [fields, setFields] = useState<Omit<FieldConfig, 'id'>[]>([]);
  const [initialised, setInitialised] = useState(false);

  if (!loading && !initialised && serverFields !== null) {
    const merged = DEFAULT_FIELDS.map(def => {
      const server = serverFields?.find(f => f.fieldKey === def.fieldKey);
      return server ? { ...def, ...server } : def;
    }).sort((a, b) => a.position - b.position);
    setFields(merged);
    setInitialised(true);
  }

  const [saving, setSaving] = useState(false);
  const [alert, setAlert]   = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  function updateField(index: number, updated: Omit<FieldConfig, 'id'>) {
    setFields(f => f.map((field, i) => i === index ? updated : field));
  }

  function moveField(index: number, direction: 'up' | 'down') {
    setFields(f => {
      const next = [...f];
      const swapIdx = direction === 'up' ? index - 1 : index + 1;
      [next[index], next[swapIdx]] = [next[swapIdx], next[index]];
      return next.map((field, i) => ({ ...field, position: i + 1 }));
    });
  }

  function addCustomField() {
    setFields(f => [...f, {
      fieldKey:       `custom_${Date.now()}`,
      label:          'Custom field',
      fieldType:      'text',
      isRequired:     false,
      isHidden:       false,
      carryToProfile: false,
      position:       f.length + 1,
    }]);
  }

  async function save() {
    setAlert(null); setSaving(true);
    try {
      await Promise.all(
        fields.map((field, i) =>
          staffApi.post('/school/admissions/field-config', { ...field, position: i + 1 }),
        ),
      );
      setAlert({ type: 'success', message: 'Admission form saved.' });
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Failed to save.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {/* Back */}
      <button onClick={() => router.push('/school/admissions')}
        className="text-sm text-slate-400 hover:text-slate-700 transition mb-5 flex items-center gap-1">
        ← Back to pipeline
      </button>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Admission Form Settings</h1>
          <p className="text-sm text-slate-500 mt-0.5">Configure which fields appear on the admission form and which carry over to the student profile on enrolment.</p>
        </div>
        <SaveButton loading={saving} onClick={save} />
      </div>

      {alert && <div className="mb-4"><Alert type={alert.type} message={alert.message} /></div>}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="px-4 py-3 w-12" />
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Field label</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Type</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">Required</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">Hidden</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">
                <span title="Copy to student profile on enrolment">Carry to profile</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} className="border-b border-slate-50">
                <td colSpan={6} className="px-4 py-3">
                  <div className="h-6 bg-slate-100 rounded animate-pulse" />
                </td>
              </tr>
            ))}
            {!loading && fields.map((field, i) => (
              <FieldRow
                key={field.fieldKey}
                field={field}
                onChange={updated => updateField(i, updated)}
                onMoveUp={() => moveField(i, 'up')}
                onMoveDown={() => moveField(i, 'down')}
                isFirst={i === 0}
                isLast={i === fields.length - 1}
                saving={saving}
              />
            ))}
          </tbody>
        </table>

        <div className="px-4 py-3 border-t border-slate-100">
          <button
            onClick={addCustomField}
            className="text-sm font-medium transition"
            style={{ color: 'var(--accent)' }}
          >
            + Add custom field
          </button>
        </div>
      </div>

      <div className="mt-4 px-1">
        <p className="text-xs text-slate-400">
          <strong>Carry to profile</strong> — when a record is moved to Enrolled, checked fields are automatically copied to the new student profile.
          First name and last name are always required and always carry over.
        </p>
      </div>

      {(isOwner || isAdmin) && <AdmissionLetterTemplateCard />}
    </div>
  );
}
