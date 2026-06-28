'use client';

import { useState, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import { staffApi, type ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { FormField, Input, SaveButton, Alert } from '@/components/ui/settings-card';
import { ReceiptModal, type ReceiptData } from '@/components/finance/receipt-modal';

type Payment = {
  id: string;
  amount: number;
  paymentDate: string;
  method: string | null;
  reference: string | null;
  recordedBy: { firstName: string; lastName: string };
};

type InvoiceItem = {
  id: string;
  name: string;
  amount: number;
  isCarryForward: boolean;
  sequence: number;
};

type InvoiceDetail = {
  id: string;
  amount: number;
  amountPaid: number;
  status: 'UNPAID' | 'PARTIAL' | 'PAID';
  dueDate: string | null;
  student: { id: string; firstName: string; lastName: string; studentId: string };
  term: { name: string };
  gradeLevel: { name: string };
  studentCategory: { name: string };
  items: InvoiceItem[];
  payments: Payment[];
};

export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id }  = use(params);
  const router  = useRouter();

  const fetchInvoice = useCallback(() => staffApi.get<InvoiceDetail>(`/school/finance/invoices/${id}`), [id]);
  const { data: invoice, loading, refetch } = useApi(fetchInvoice);

  const [form, setForm] = useState({ amount: '', method: 'Cash', reference: '', paymentDate: new Date().toISOString().split('T')[0] });
  const [saving, setSaving] = useState(false);
  const [alert, setAlert]   = useState<{ type: 'error' | 'success'; message: string } | null>(null);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  function paymentReceipt(p: Payment): ReceiptData {
    return {
      receiptNo:    `RCT-${p.id.slice(0, 8).toUpperCase()}`,
      studentName:  `${invoice!.student.firstName} ${invoice!.student.lastName}`,
      studentId:    invoice!.student.studentId,
      description:  `School Fees — ${invoice!.term.name}`,
      amount:       p.amount,
      paymentDate:  p.paymentDate,
      method:       p.method,
      reference:    p.reference,
      recordedBy:   `${p.recordedBy.firstName} ${p.recordedBy.lastName}`,
      invoiceTotal: invoice!.amount,
      invoicePaid:  invoice!.amountPaid,
    };
  }

  async function recordPayment() {
    if (!form.amount) { setAlert({ type: 'error', message: 'Enter an amount.' }); return; }
    setAlert(null); setSaving(true);
    try {
      await staffApi.post(`/school/finance/invoices/${id}/payments`, {
        amount:      parseFloat(form.amount),
        method:      form.method,
        reference:   form.reference || null,
        paymentDate: form.paymentDate,
      });
      setForm(f => ({ ...f, amount: '', reference: '' }));
      setAlert({ type: 'success', message: 'Payment recorded.' });
      refetch();
    } catch (err) {
      setAlert({ type: 'error', message: (err as ApiError).message ?? 'Failed to record payment.' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return (
    <div className="space-y-4">
      <div className="h-20 bg-slate-100 rounded-2xl animate-pulse" />
      <div className="h-48 bg-slate-100 rounded-2xl animate-pulse" />
    </div>
  );
  if (!invoice) return <p className="text-sm text-slate-400">Invoice not found.</p>;

  const balance   = invoice.amount - invoice.amountPaid;
  const pctPaid   = invoice.amount > 0 ? Math.round((invoice.amountPaid / invoice.amount) * 100) : 0;

  return (
    <div>
      <button onClick={() => router.push('/school/finance/invoices')}
        className="text-sm text-slate-400 hover:text-slate-700 transition mb-5 flex items-center gap-1">
        ← Back to invoices
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            {invoice.student.firstName} {invoice.student.lastName}
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {invoice.gradeLevel?.name} · {invoice.studentCategory?.name} · {invoice.term.name}
          </p>
          <p className="text-xs font-mono text-slate-400 mt-0.5">{invoice.student.studentId}</p>
        </div>
        <div className="text-right">
          <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
            invoice.status === 'PAID'    ? 'bg-emerald-100 text-emerald-700' :
            invoice.status === 'PARTIAL' ? 'bg-amber-100 text-amber-700' :
                                           'bg-red-100 text-red-600'
          }`}>
            {invoice.status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left: payment details */}
        <div className="col-span-2 space-y-5">
          {/* Invoice summary */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-5">
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <p className="text-xs text-slate-400">Total billed</p>
                <p className="text-xl font-bold text-slate-800">GHS {invoice.amount.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Paid</p>
                <p className="text-xl font-bold text-emerald-600">GHS {invoice.amountPaid.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Balance</p>
                <p className={`text-xl font-bold ${balance > 0 ? 'text-red-500' : 'text-slate-400'}`}>
                  GHS {balance.toFixed(2)}
                </p>
              </div>
            </div>
            {/* Progress bar */}
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all"
                style={{ width: `${pctPaid}%`, backgroundColor: pctPaid === 100 ? '#22c55e' : 'var(--accent)' }} />
            </div>
            <p className="text-xs text-slate-400 mt-1">{pctPaid}% paid</p>
          </div>

          {/* Fee breakdown */}
          {invoice.items && invoice.items.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">Fee breakdown</h3>
              <table className="w-full">
                <tbody>
                  {invoice.items.map(it => (
                    <tr key={it.id} className="border-b border-slate-50 last:border-0">
                      <td className="py-2 text-sm text-slate-600">
                        {it.name}
                        {it.isCarryForward && (
                          <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                            Arrears
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-sm text-right font-medium text-slate-800">
                        GHS {it.amount.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-slate-200">
                    <td className="pt-3 text-sm font-semibold text-slate-700">Total billed</td>
                    <td className="pt-3 text-sm text-right font-bold text-slate-900">GHS {invoice.amount.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Payment history */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Payment history</h3>
            {invoice.payments.length === 0 ? (
              <p className="text-sm text-slate-400 italic">No payments recorded yet.</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-50">
                    <th className="pb-2 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Date</th>
                    <th className="pb-2 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide">Amount</th>
                    <th className="pb-2 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Method</th>
                    <th className="pb-2 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Reference</th>
                    <th className="pb-2 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Recorded by</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {invoice.payments.map(p => (
                    <tr key={p.id}
                      onClick={() => setReceipt(paymentReceipt(p))}
                      className="border-b border-slate-50 last:border-0 hover:bg-slate-50/40 transition cursor-pointer">
                      <td className="py-2.5 text-sm text-slate-600">
                        {new Date(p.paymentDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="py-2.5 text-sm font-semibold text-emerald-600 text-right">
                        GHS {p.amount.toFixed(2)}
                      </td>
                      <td className="py-2.5 text-xs text-slate-500 pl-4">{p.method ?? '—'}</td>
                      <td className="py-2.5 text-xs font-mono text-slate-400">{p.reference ?? '—'}</td>
                      <td className="py-2.5 text-xs text-slate-500">
                        {p.recordedBy.firstName} {p.recordedBy.lastName}
                      </td>
                      <td className="py-2.5 text-right">
                        <button onClick={e => { e.stopPropagation(); setReceipt(paymentReceipt(p)); }}
                          className="text-xs font-medium transition" style={{ color: 'var(--accent)' }}>
                          Receipt
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right: record payment */}
        {balance > 0 && (
          <div className="col-span-1">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-5 sticky top-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">Record payment</h3>
              {alert && <div className="mb-3"><Alert type={alert.type} message={alert.message} /></div>}
              <div className="space-y-3">
                <FormField label="Amount (GHS)" required>
                  <Input type="number" value={form.amount} min="0.01" max={String(balance)} step="0.01"
                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
                </FormField>
                <FormField label="Method">
                  <select value={form.method} onChange={e => setForm(f => ({ ...f, method: e.target.value }))}
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 outline-none">
                    {['Cash', 'Mobile Money', 'Bank Transfer', 'Cheque', 'Other'].map(m => <option key={m}>{m}</option>)}
                  </select>
                </FormField>
                <FormField label="Reference">
                  <Input value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} placeholder="Receipt / transaction ref" />
                </FormField>
                <FormField label="Payment date">
                  <Input type="date" value={form.paymentDate} onChange={e => setForm(f => ({ ...f, paymentDate: e.target.value }))} />
                </FormField>
                <div className="pt-1">
                  <SaveButton loading={saving} onClick={recordPayment} label="Record payment" />
                </div>
              </div>
            </div>
          </div>
        )}

        {balance <= 0 && (
          <div className="col-span-1">
            <div className="bg-emerald-50 rounded-2xl border border-emerald-100 px-5 py-6 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-emerald-700">Fully paid</p>
              <p className="text-xs text-emerald-600 mt-0.5">No outstanding balance.</p>
            </div>
          </div>
        )}
      </div>

      <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
}
