'use client';

import { useState } from 'react';
import { staffApi, type ApiError } from '@/lib/api';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, SaveButton, Alert } from '@/components/ui/settings-card';

export const EXPENSE_METHODS = ['Cash', 'Mobile Money', 'Bank Transfer', 'Cheque', 'Card', 'Other'];

export type ExpenseCategory = { id: string; name: string; isArchived: boolean };
export type TermOption = { id: string; name: string; isActive?: boolean };

export type EditableExpense = {
  id: string;
  categoryId: string;
  termId: string;
  amount: number;
  expenseDate: string;
  payee: string | null;
  method: string | null;
  reference: string | null;
  notes: string | null;
};

function today() { return new Date().toISOString().split('T')[0]; }

export function ExpenseFormModal({
  open, expense, categories, terms, activeTermId, endpointBase = '/school/finance', onClose, onSaved,
}: {
  open: boolean;
  expense: EditableExpense | null;   // null = create
  categories: ExpenseCategory[];
  terms: TermOption[];
  activeTermId: string;
  endpointBase?: string;             // '/school/finance' | '/school/transport' | '/school/feeding'
  onClose: () => void;
  onSaved: () => void;
}) {
  const liveCategories = categories.filter(c => !c.isArchived || c.id === expense?.categoryId);

  const blank = () => ({
    categoryId:  expense?.categoryId ?? liveCategories[0]?.id ?? '',
    termId:      expense?.termId ?? activeTermId ?? terms[0]?.id ?? '',
    amount:      expense ? String(expense.amount) : '',
    expenseDate: expense?.expenseDate ? expense.expenseDate.split('T')[0] : today(),
    payee:       expense?.payee ?? '',
    method:      expense?.method ?? 'Cash',
    reference:   expense?.reference ?? '',
    notes:       expense?.notes ?? '',
  });

  const [form, setForm]     = useState(blank);
  const [saving, setSaving] = useState(false);
  const [alert, setAlert]   = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  // Re-seed the form whenever a different record (or create) is opened.
  const openKey = `${open ? '1' : '0'}:${expense?.id ?? 'new'}`;
  const [lastKey, setLastKey] = useState('');
  if (open && openKey !== lastKey) {
    setLastKey(openKey);
    setForm(blank());
    setAlert(null);
  }

  if (!open) return null;

  async function save() {
    if (!form.categoryId) { setAlert({ type: 'error', message: 'Pick a category.' }); return; }
    if (!form.termId)     { setAlert({ type: 'error', message: 'Pick a term.' }); return; }
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) { setAlert({ type: 'error', message: 'Enter an amount greater than zero.' }); return; }

    setAlert(null); setSaving(true);
    const payload = {
      categoryId:  form.categoryId,
      termId:      form.termId,
      amount,
      expenseDate: form.expenseDate,
      payee:       form.payee || null,
      method:      form.method || null,
      reference:   form.reference || null,
      notes:       form.notes || null,
    };
    try {
      if (expense) await staffApi.patch(`${endpointBase}/expenses/${expense.id}`, payload);
      else         await staffApi.post(`${endpointBase}/expenses`, payload);
      onSaved();
      onClose();
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Failed to save expense.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={expense ? 'Edit expense' : 'Record expense'} width="max-w-md">
      {alert && <div className="mb-3"><Alert type={alert.type} message={alert.message} /></div>}

      <div className="space-y-3">
        <FormField label="Category" required>
          <select value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}
            className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 outline-none">
            {liveCategories.length === 0 && <option value="">No categories — add one first</option>}
            {liveCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Amount (GHS)" required>
            <Input type="number" value={form.amount} min="0.01" step="0.01" placeholder="0.00"
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
          </FormField>
          <FormField label="Date" required>
            <Input type="date" value={form.expenseDate}
              onChange={e => setForm(f => ({ ...f, expenseDate: e.target.value }))} />
          </FormField>
        </div>

        <FormField label="Term" required>
          <select value={form.termId} onChange={e => setForm(f => ({ ...f, termId: e.target.value }))}
            className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 outline-none">
            {terms.map(t => <option key={t.id} value={t.id}>{t.name}{t.isActive ? ' ✓' : ''}</option>)}
          </select>
        </FormField>

        <FormField label="Payee / vendor">
          <Input value={form.payee} placeholder="e.g. ECG, landlord, supplier"
            onChange={e => setForm(f => ({ ...f, payee: e.target.value }))} />
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Method">
            <select value={form.method} onChange={e => setForm(f => ({ ...f, method: e.target.value }))}
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 outline-none">
              {EXPENSE_METHODS.map(m => <option key={m}>{m}</option>)}
            </select>
          </FormField>
          <FormField label="Reference">
            <Input value={form.reference} placeholder="Receipt / cheque no."
              onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} />
          </FormField>
        </div>

        <FormField label="Notes">
          <Input value={form.notes} placeholder="Optional"
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        </FormField>
      </div>

      <div className="flex items-center justify-end gap-2 mt-5">
        <button onClick={onClose}
          className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition">
          Cancel
        </button>
        <SaveButton loading={saving} onClick={save} label={expense ? 'Save changes' : 'Record expense'} />
      </div>
    </Modal>
  );
}
