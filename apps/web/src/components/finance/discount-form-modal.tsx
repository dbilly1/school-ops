'use client';

import { useState } from 'react';
import { staffApi, type ApiError } from '@/lib/api';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, SaveButton, Alert } from '@/components/ui/settings-card';

// Add / edit a per-student discount or scholarship. Mirrors the other finance
// form modals (expense, payment) for consistency.

export type DiscountKind = 'DISCOUNT' | 'SCHOLARSHIP' | 'BURSARY';
export type DiscountType = 'PERCENT' | 'FIXED';
export type DiscountFrequency = 'PER_TERM' | 'PER_YEAR' | 'ONE_TIME';

export type Discount = {
  id: string;
  feeComponentId: string | null;
  component: { id: string; name: string } | null;
  kind: DiscountKind;
  type: DiscountType;
  value: number;
  label: string | null;
  frequency: DiscountFrequency;
  isActive: boolean;
};

export type DiscountComponent = { id: string; name: string; sequence: number };

export const KIND_LABEL: Record<DiscountKind, string> = {
  DISCOUNT: 'Discount', SCHOLARSHIP: 'Scholarship', BURSARY: 'Bursary',
};

export const FREQUENCY_LABEL: Record<DiscountFrequency, string> = {
  PER_TERM: 'Every term', PER_YEAR: 'Once a year', ONE_TIME: 'One-time',
};

export function DiscountFormModal({
  open, discount, studentId, components, onClose, onSaved,
}: {
  open: boolean;
  discount: Discount | null;   // null = create
  studentId: string;
  components: DiscountComponent[] | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const blank = () => ({
    kind:           discount?.kind ?? 'DISCOUNT' as DiscountKind,
    type:           discount?.type ?? 'PERCENT' as DiscountType,
    value:          discount ? String(discount.value) : '',
    feeComponentId: discount?.feeComponentId ?? '',
    label:          discount?.label ?? '',
    frequency:      discount?.frequency ?? 'PER_TERM' as DiscountFrequency,
  });

  const [form, setForm]     = useState(blank);
  const [saving, setSaving] = useState(false);
  const [alert, setAlert]   = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  // Re-seed whenever a different record (or create) is opened.
  const openKey = `${open ? '1' : '0'}:${discount?.id ?? 'new'}`;
  const [lastKey, setLastKey] = useState('');
  if (open && openKey !== lastKey) {
    setLastKey(openKey);
    setForm(blank());
    setAlert(null);
  }

  if (!open) return null;

  async function save() {
    const value = parseFloat(form.value);
    if (!value || value <= 0) { setAlert({ type: 'error', message: 'Enter a value greater than 0.' }); return; }
    if (form.type === 'PERCENT' && value > 100) { setAlert({ type: 'error', message: 'A percentage cannot exceed 100.' }); return; }

    setAlert(null); setSaving(true);
    const payload = {
      kind:           form.kind,
      type:           form.type,
      value,
      feeComponentId: form.feeComponentId || null,
      label:          form.label.trim() || null,
      frequency:      form.frequency,
    };
    try {
      if (discount) await staffApi.patch(`/school/finance/discounts/${discount.id}`, payload);
      else          await staffApi.post('/school/finance/discounts', { studentId, ...payload });
      onSaved();
      onClose();
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Failed to save discount.' });
    } finally {
      setSaving(false);
    }
  }

  const sortedComponents = (components ?? []).slice().sort((a, b) => a.sequence - b.sequence);

  return (
    <Modal open={open} onClose={onClose} title={discount ? 'Edit discount' : 'Add discount or scholarship'} width="max-w-md">
      {alert && <div className="mb-3"><Alert type={alert.type} message={alert.message} /></div>}

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Type">
            <select value={form.kind} onChange={e => setForm(f => ({ ...f, kind: e.target.value as DiscountKind }))}
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 outline-none">
              {(['DISCOUNT', 'SCHOLARSHIP', 'BURSARY'] as DiscountKind[]).map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select>
          </FormField>
          <FormField label="Applies to">
            <select value={form.feeComponentId} onChange={e => setForm(f => ({ ...f, feeComponentId: e.target.value }))}
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 outline-none">
              <option value="">Whole bill</option>
              {sortedComponents.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Amount type">
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as DiscountType }))}
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 outline-none">
              <option value="PERCENT">Percentage (%)</option>
              <option value="FIXED">Fixed amount (GHS)</option>
            </select>
          </FormField>
          <FormField label={form.type === 'PERCENT' ? 'Percentage' : 'Amount (GHS)'} required>
            <Input type="number" min="0.01" step="0.01" max={form.type === 'PERCENT' ? '100' : undefined}
              value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
              placeholder={form.type === 'PERCENT' ? 'e.g. 50' : 'e.g. 200'} />
          </FormField>
        </div>

        <FormField label="Recurs">
          <select value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value as DiscountFrequency }))}
            className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 outline-none">
            <option value="PER_TERM">Every term</option>
            <option value="PER_YEAR">First invoice of each year</option>
            <option value="ONE_TIME">One-time (first invoice only)</option>
          </select>
        </FormField>

        <FormField label="Reason / label">
          <Input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
            placeholder="e.g. Staff child, Sibling, Sponsored by Rotary" />
        </FormField>
      </div>

      <div className="flex items-center justify-end gap-2 mt-5">
        <button onClick={onClose}
          className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition">
          Cancel
        </button>
        <SaveButton loading={saving} onClick={save} label={discount ? 'Save changes' : 'Add'} />
      </div>
    </Modal>
  );
}
