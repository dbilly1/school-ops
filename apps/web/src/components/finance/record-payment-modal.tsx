'use client';

import { useState } from 'react';
import { staffApi, type ApiError } from '@/lib/api';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, SaveButton, Alert } from '@/components/ui/settings-card';

// Quick "record payment" dialog — lets staff take a payment against an invoice
// straight from a table row, without navigating to the invoice detail page.

export type PayableInvoice = {
  id: string;
  studentName: string;
  balance: number;
};

const METHODS = ['Cash', 'Mobile Money', 'Bank Transfer', 'Cheque', 'Other'];

export function RecordPaymentModal({
  invoice,
  onClose,
  onRecorded,
  payerSuggestions = [],
}: {
  invoice: PayableInvoice | null;
  onClose: () => void;
  onRecorded: () => void;
  // Names to offer in the "Paid by" datalist (e.g. the student's guardians).
  payerSuggestions?: string[];
}) {
  const [form, setForm] = useState({
    amount: '',
    method: 'Cash',
    reference: '',
    paidBy: '',
    paymentDate: new Date().toISOString().split('T')[0],
  });
  const [saving, setSaving] = useState(false);
  const [alert, setAlert]   = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  // Reset the form whenever a new invoice is opened.
  const openKey = invoice?.id ?? '';
  const [lastKey, setLastKey] = useState('');
  if (openKey && openKey !== lastKey) {
    setLastKey(openKey);
    setForm({ amount: '', method: 'Cash', reference: '', paidBy: '', paymentDate: new Date().toISOString().split('T')[0] });
    setAlert(null);
  }

  if (!invoice) return null;

  async function recordPayment() {
    if (!invoice) return;
    if (!form.amount) { setAlert({ type: 'error', message: 'Enter an amount.' }); return; }
    setAlert(null); setSaving(true);
    try {
      await staffApi.post(`/school/finance/invoices/${invoice.id}/payments`, {
        amount:      parseFloat(form.amount),
        method:      form.method,
        reference:   form.reference || null,
        paidBy:      form.paidBy.trim() || null,
        paymentDate: form.paymentDate,
      });
      onRecorded();
      onClose();
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Failed to record payment.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={!!invoice} onClose={onClose} title="Record Payment" width="max-w-md">
      <div className="mb-4 flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-slate-800">{invoice.studentName}</p>
          <p className="text-xs text-slate-400">Outstanding balance</p>
        </div>
        <p className="text-lg font-bold text-red-500">
          GHS {invoice.balance.toLocaleString('en-GH', { minimumFractionDigits: 2 })}
        </p>
      </div>

      {alert && <div className="mb-3"><Alert type={alert.type} message={alert.message} /></div>}

      <div className="space-y-3">
        <FormField label="Amount (GHS)" required>
          <Input type="number" value={form.amount} min="0.01" max={String(invoice.balance)} step="0.01"
            onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
        </FormField>
        <FormField label="Method">
          <select value={form.method} onChange={e => setForm(f => ({ ...f, method: e.target.value }))}
            className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 outline-none">
            {METHODS.map(m => <option key={m}>{m}</option>)}
          </select>
        </FormField>
        <FormField label="Reference">
          <Input value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} placeholder="Receipt / transaction ref" />
        </FormField>
        <FormField label="Paid by">
          <Input list="payer-suggestions" value={form.paidBy}
            onChange={e => setForm(f => ({ ...f, paidBy: e.target.value }))} placeholder="Name of person paying" />
          {payerSuggestions.length > 0 && (
            <datalist id="payer-suggestions">
              {payerSuggestions.map(n => <option key={n} value={n} />)}
            </datalist>
          )}
        </FormField>
        <FormField label="Payment date">
          <Input type="date" value={form.paymentDate} onChange={e => setForm(f => ({ ...f, paymentDate: e.target.value }))} />
        </FormField>
      </div>

      <div className="flex items-center justify-end gap-2 mt-5">
        <button onClick={onClose}
          className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition">
          Cancel
        </button>
        <SaveButton loading={saving} onClick={recordPayment} label="Record payment" />
      </div>
    </Modal>
  );
}
