'use client';

import { useCallback } from 'react';
import { staffApi } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { Modal } from '@/components/ui/modal';

// A printable payment receipt. Renders an on-screen preview and prints a clean,
// self-contained document (via a hidden iframe) so staff can print or "Save as
// PDF" for any fee payment — school fees, feeding, transport, etc.

export type ReceiptData = {
  receiptNo: string;
  studentName: string;
  studentId: string;
  description: string;          // e.g. "School Fees — Term 1"
  amount: number;
  paymentDate: string | Date;
  method: string | null;
  reference: string | null;
  recordedBy: string;
  invoiceTotal?: number;        // optional running balance context
  invoicePaid?: number;
};

type SchoolProfile = {
  name: string;
  country: string;
  address: string | null;
  phone: string | null;
  email?: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
};

const ghs = (n: number) => `GHS ${n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function formatDate(d: string | Date) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function buildReceiptHtml(r: ReceiptData, school: SchoolProfile | null) {
  const accent = school?.primaryColor || '#065f46';
  const balance = r.invoiceTotal != null && r.invoicePaid != null ? r.invoiceTotal - r.invoicePaid : null;
  const contactBits = [school?.address, school?.phone, school?.email]
    .filter((v): v is string => !!v)
    .map(escapeHtml)
    .join(' &middot; ');

  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:7px 0;color:#64748b;font-size:13px;">${label}</td>
      <td style="padding:7px 0;text-align:right;font-size:13px;color:#0f172a;font-weight:500;">${value}</td>
    </tr>`;

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Receipt ${escapeHtml(r.receiptNo)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; color: #0f172a; }
  .wrap { max-width: 560px; margin: 0 auto; padding: 40px 36px; }
  .header { display: flex; align-items: center; gap: 14px; border-bottom: 2px solid ${accent}; padding-bottom: 18px; }
  .header img { height: 52px; width: 52px; object-fit: contain; border-radius: 8px; }
  .school-name { font-size: 20px; font-weight: 700; color: ${accent}; margin: 0; }
  .school-contact { font-size: 11px; color: #64748b; margin-top: 3px; }
  .title { text-align: center; font-size: 13px; letter-spacing: 2px; text-transform: uppercase; color: #94a3b8; margin: 26px 0 4px; }
  .amount { text-align: center; font-size: 34px; font-weight: 800; color: ${accent}; margin: 0 0 26px; }
  table { width: 100%; border-collapse: collapse; }
  .divider td { border-top: 1px dashed #e2e8f0; padding-top: 0; }
  .footer { margin-top: 32px; padding-top: 18px; border-top: 1px solid #f1f5f9; font-size: 11px; color: #94a3b8; text-align: center; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .wrap { padding: 24px; } }
</style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      ${school?.logoUrl ? `<img src="${escapeHtml(school.logoUrl)}" alt="" />` : ''}
      <div>
        <p class="school-name">${escapeHtml(school?.name || 'School')}</p>
        ${contactBits ? `<p class="school-contact">${contactBits}</p>` : ''}
      </div>
    </div>

    <p class="title">Payment Receipt</p>
    <p class="amount">${ghs(r.amount)}</p>

    <table>
      ${row('Receipt No.', escapeHtml(r.receiptNo))}
      ${row('Date', formatDate(r.paymentDate))}
      ${row('Student', escapeHtml(r.studentName))}
      ${row('Student ID', escapeHtml(r.studentId))}
      ${row('For', escapeHtml(r.description))}
      ${row('Method', escapeHtml(r.method || '—'))}
      ${r.reference ? row('Reference', escapeHtml(r.reference)) : ''}
      ${row('Received by', escapeHtml(r.recordedBy))}
      ${balance != null ? `<tr class="divider"><td colspan="2"></td></tr>
      ${row('Invoice total', ghs(r.invoiceTotal!))}
      ${row('Total paid', ghs(r.invoicePaid!))}
      ${row('Balance', ghs(balance))}` : ''}
    </table>

    <div class="footer">
      Thank you. This is a computer-generated receipt.
    </div>
  </div>
</body>
</html>`;
}

function printHtml(html: string) {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const doc = win?.document;
  if (!win || !doc) { document.body.removeChild(iframe); return; }

  doc.open();
  doc.write(html);
  doc.close();

  const trigger = () => {
    win.focus();
    win.print();
    // Give the print dialog time to grab the document before we tear it down.
    setTimeout(() => { iframe.parentNode && document.body.removeChild(iframe); }, 1000);
  };

  // Wait for the logo image (if any) to load so it's included in the print.
  if (doc.images.length > 0) {
    iframe.onload = () => setTimeout(trigger, 80);
  } else {
    setTimeout(trigger, 80);
  }
}

export function ReceiptModal({ receipt, onClose }: { receipt: ReceiptData | null; onClose: () => void }) {
  const fetchProfile = useCallback(() => staffApi.get<SchoolProfile>('/school/profile').catch(() => null), []);
  const { data: school } = useApi(fetchProfile);

  if (!receipt) return null;

  const balance =
    receipt.invoiceTotal != null && receipt.invoicePaid != null
      ? receipt.invoiceTotal - receipt.invoicePaid
      : null;

  return (
    <Modal open={!!receipt} onClose={onClose} title="Payment Receipt" width="max-w-md">
      <div className="rounded-xl border border-slate-100 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b-2" style={{ borderColor: 'var(--accent)' }}>
          {school?.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={school.logoUrl} alt="" className="h-11 w-11 object-contain rounded-lg" />
          )}
          <div>
            <p className="text-base font-bold" style={{ color: 'var(--accent)' }}>{school?.name ?? 'School'}</p>
            {(school?.address || school?.phone) && (
              <p className="text-[11px] text-slate-400">
                {[school?.address, school?.phone].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        </div>

        {/* Amount */}
        <div className="text-center pt-5">
          <p className="text-[11px] uppercase tracking-[2px] text-slate-400">Payment Receipt</p>
          <p className="text-3xl font-extrabold mt-1" style={{ color: 'var(--accent)' }}>{ghs(receipt.amount)}</p>
        </div>

        {/* Details */}
        <div className="px-5 py-4">
          <dl className="text-sm divide-y divide-slate-50">
            {[
              ['Receipt No.', receipt.receiptNo],
              ['Date', formatDate(receipt.paymentDate)],
              ['Student', receipt.studentName],
              ['Student ID', receipt.studentId],
              ['For', receipt.description],
              ['Method', receipt.method || '—'],
              ...(receipt.reference ? [['Reference', receipt.reference]] : []),
              ['Received by', receipt.recordedBy],
            ].map(([label, value]) => (
              <div key={label as string} className="flex items-center justify-between py-2 gap-4">
                <dt className="text-slate-500 shrink-0">{label}</dt>
                <dd className="text-slate-800 font-medium text-right break-words">{value}</dd>
              </div>
            ))}
            {balance != null && (
              <>
                <div className="flex items-center justify-between py-2 border-t border-dashed border-slate-200">
                  <dt className="text-slate-500">Invoice total</dt>
                  <dd className="text-slate-800 font-medium">{ghs(receipt.invoiceTotal!)}</dd>
                </div>
                <div className="flex items-center justify-between py-2">
                  <dt className="text-slate-500">Total paid</dt>
                  <dd className="text-emerald-600 font-medium">{ghs(receipt.invoicePaid!)}</dd>
                </div>
                <div className="flex items-center justify-between py-2">
                  <dt className="text-slate-500">Balance</dt>
                  <dd className={balance > 0 ? 'text-red-500 font-semibold' : 'text-slate-400 font-medium'}>{ghs(balance)}</dd>
                </div>
              </>
            )}
          </dl>
        </div>
      </div>

      <div className="flex gap-2 mt-5">
        <button
          onClick={onClose}
          className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition">
          Close
        </button>
        <button
          onClick={() => printHtml(buildReceiptHtml(receipt, school ?? null))}
          className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition"
          style={{ backgroundColor: 'var(--accent)' }}>
          Print / Save as PDF
        </button>
      </div>
    </Modal>
  );
}
