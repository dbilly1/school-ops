'use client';

import { useCallback } from 'react';
import { staffApi } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { Modal } from '@/components/ui/modal';

// A preview of the invoice a class — or a specific student — would be billed,
// built from the current Fee Setup. Renders an on-screen preview and prints a
// clean, self-contained document (via a hidden iframe) so staff can sanity-check
// or share the bill.

export type InvoicePreviewLine = {
  name: string;
  amount: number;
  tag?: string;                         // small pill, e.g. "Once a year", "Arrears"
};

export type InvoicePreviewStudent = {
  name: string;
  studentId: string;
  guardianName: string | null;
};

export type InvoicePreviewData = {
  className: string;
  lines: InvoicePreviewLine[];
  student?: InvoicePreviewStudent;      // present for a per-student bill
  issuedBy?: string | null;             // staff member generating / issuing
  date?: string | Date;                 // defaults to now
  preview?: boolean;                    // true (default) = estimate from setup; false = real invoice
};

type SchoolProfile = {
  name: string;
  country: string;
  address: string | null;
  phone: string | null;
  email?: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  feePaymentGuidelines?: string | null;
};

const ghs = (n: number) => `GHS ${n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function formatDate(d: string | Date) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '—';
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function buildInvoiceHtml(d: InvoicePreviewData, school: SchoolProfile | null) {
  const accent = school?.primaryColor || '#065f46';
  const isPreview = d.preview !== false;
  const guidelines = school?.feePaymentGuidelines?.trim() || '';
  const total = d.lines.reduce((sum, l) => sum + l.amount, 0);
  const dateStr = formatDate(d.date ?? new Date());
  const contactBits = [school?.address, school?.phone, school?.email]
    .filter((v): v is string => !!v)
    .map(escapeHtml)
    .join(' &middot; ');

  const metaRow = (label: string, value: string) => `
    <tr>
      <td style="padding:3px 0;color:#64748b;font-size:12px;">${label}</td>
      <td style="padding:3px 0;text-align:right;font-size:12px;color:#0f172a;font-weight:500;">${value}</td>
    </tr>`;

  // "Billed to" block — student details when present, else just the class.
  const billTo = d.student
    ? `<div style="display:flex;align-items:center;gap:12px;">
        <div style="width:44px;height:44px;border-radius:50%;background:${accent};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;">${escapeHtml(initials(d.student.name))}</div>
        <div>
          <div style="font-size:15px;font-weight:700;color:#0f172a;">${escapeHtml(d.student.name)}</div>
          <div style="font-size:12px;color:#64748b;">${escapeHtml(d.student.studentId)} &middot; ${escapeHtml(d.className)}</div>
        </div>
      </div>`
    : `<div style="font-size:15px;font-weight:700;color:#0f172a;">${escapeHtml(d.className)}</div>`;

  const itemRows = d.lines.map(l => `
    <tr>
      <td style="padding:9px 0;font-size:13px;color:#0f172a;">
        ${escapeHtml(l.name)}
        ${l.tag ? `<span style="font-size:10px;color:#0369a1;background:#e0f2fe;border-radius:9px;padding:1px 6px;margin-left:6px;">${escapeHtml(l.tag)}</span>` : ''}
      </td>
      <td style="padding:9px 0;text-align:right;font-size:13px;color:#0f172a;font-weight:500;">${ghs(l.amount)}</td>
    </tr>`).join('');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Fee Invoice — ${escapeHtml(d.student?.name ?? d.className)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; color: #0f172a; }
  .wrap { max-width: 600px; margin: 0 auto; padding: 40px 36px; }
  .header { display: flex; align-items: center; gap: 14px; border-bottom: 2px solid ${accent}; padding-bottom: 18px; }
  .header img { height: 52px; width: 52px; object-fit: contain; border-radius: 8px; }
  .school-name { font-size: 20px; font-weight: 700; color: ${accent}; margin: 0; }
  .school-contact { font-size: 11px; color: #64748b; margin-top: 3px; }
  .title { font-size: 13px; letter-spacing: 2px; text-transform: uppercase; color: #94a3b8; margin: 24px 0 14px; }
  .billbar { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 22px; }
  .meta { min-width: 200px; }
  table { width: 100%; border-collapse: collapse; }
  thead th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
  thead th.r { text-align: right; }
  tbody tr { border-bottom: 1px solid #f1f5f9; }
  .total td { padding-top: 12px; font-size: 15px; font-weight: 800; color: ${accent}; border-top: 2px solid ${accent}; }
  .note { font-size: 11px; color: #94a3b8; margin-top: 10px; }
  .guideline { margin-top: 28px; padding: 14px 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; }
  .guideline h4 { margin: 0 0 5px; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; }
  .guideline p { margin: 0; font-size: 12px; color: #334155; white-space: pre-line; line-height: 1.5; }
  .footer { margin-top: 28px; padding-top: 16px; border-top: 1px solid #f1f5f9; font-size: 11px; color: #94a3b8; text-align: center; }
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

    <p class="title">${isPreview ? 'Fee Invoice — Preview' : 'Fee Invoice'}</p>
    <div class="billbar">
      ${billTo}
      <table class="meta">
        ${metaRow('Date', dateStr)}
        ${d.student?.guardianName ? metaRow('Guardian', escapeHtml(d.student.guardianName)) : ''}
        ${d.issuedBy ? metaRow('Issued by', escapeHtml(d.issuedBy)) : ''}
      </table>
    </div>

    <table>
      <thead>
        <tr><th>Item</th><th class="r">Amount</th></tr>
      </thead>
      <tbody>
        ${itemRows || '<tr><td colspan="2" style="padding:14px 0;color:#94a3b8;font-style:italic;">No fees set for this class yet.</td></tr>'}
        <tr class="total"><td>Total</td><td style="text-align:right;">${ghs(total)}</td></tr>
      </tbody>
    </table>
    ${isPreview ? '<p class="note">One-time and yearly items are billed only on the applicable invoice; every-term items are billed each term.</p>' : ''}

    ${guidelines ? `<div class="guideline">
      <h4>Payment Guidelines</h4>
      <p>${escapeHtml(guidelines)}</p>
    </div>` : ''}

    <div class="footer">${isPreview ? 'This is a preview generated from the current fee setup, not a finalised invoice.' : 'Computer-generated invoice.'}</div>
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
    setTimeout(() => { iframe.parentNode && document.body.removeChild(iframe); }, 1000);
  };

  if (doc.images.length > 0) {
    iframe.onload = () => setTimeout(trigger, 80);
  } else {
    setTimeout(trigger, 80);
  }
}

export function InvoicePreviewModal({ data, onClose }: { data: InvoicePreviewData | null; onClose: () => void }) {
  const fetchProfile = useCallback(() => staffApi.get<SchoolProfile>('/school/profile').catch(() => null), []);
  const { data: school } = useApi(fetchProfile);

  if (!data) return null;

  const isPreview = data.preview !== false;
  const total = data.lines.reduce((sum, l) => sum + l.amount, 0);
  const dateStr = formatDate(data.date ?? new Date());

  return (
    <Modal open={!!data} onClose={onClose} title={isPreview ? 'Invoice Preview' : 'Invoice'} width="max-w-lg">
      <div className="rounded-xl border border-slate-100 overflow-hidden">
        {/* School header */}
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

        {/* Invoice title + billed-to */}
        <div className="px-5 pt-5">
          <p className="text-[11px] uppercase tracking-[2px] text-slate-400 mb-3">{isPreview ? 'Fee Invoice — Preview' : 'Fee Invoice'}</p>
          <div className="flex items-start justify-between gap-4">
            {data.student ? (
              <div className="flex items-center gap-3">
                {/* Avatar — initials placeholder; swap for student photo later */}
                <div className="w-11 h-11 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                  style={{ backgroundColor: 'var(--accent)' }}>
                  {initials(data.student.name)}
                </div>
                <div>
                  <p className="text-[15px] font-bold text-slate-900">{data.student.name}</p>
                  <p className="text-xs text-slate-500">{data.student.studentId} · {data.className}</p>
                </div>
              </div>
            ) : (
              <p className="text-[15px] font-bold text-slate-900">{data.className}</p>
            )}
            <dl className="text-xs text-right space-y-0.5 shrink-0">
              <div className="flex justify-between gap-6"><dt className="text-slate-400">Date</dt><dd className="text-slate-700 font-medium">{dateStr}</dd></div>
              {data.student?.guardianName && (
                <div className="flex justify-between gap-6"><dt className="text-slate-400">Guardian</dt><dd className="text-slate-700 font-medium">{data.student.guardianName}</dd></div>
              )}
              {data.issuedBy && (
                <div className="flex justify-between gap-6"><dt className="text-slate-400">Issued by</dt><dd className="text-slate-700 font-medium">{data.issuedBy}</dd></div>
              )}
            </dl>
          </div>
        </div>

        {/* Bill items */}
        <div className="px-5 py-4 mt-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400 pb-1.5">Item</th>
                <th className="text-right text-[11px] font-semibold uppercase tracking-wide text-slate-400 pb-1.5">Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.length === 0 ? (
                <tr><td colSpan={2} className="py-3.5 text-slate-400 italic">No fees set for this class yet.</td></tr>
              ) : data.lines.map((l, i) => (
                <tr key={i} className="border-b border-slate-50">
                  <td className="py-2.5 text-slate-700">
                    {l.name}
                    {l.tag && (
                      <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700">
                        {l.tag}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 text-right text-slate-800 font-medium">{ghs(l.amount)}</td>
                </tr>
              ))}
              <tr>
                <td className="pt-3 text-base font-extrabold" style={{ color: 'var(--accent)' }}>Total</td>
                <td className="pt-3 text-right text-base font-extrabold" style={{ color: 'var(--accent)' }}>{ghs(total)}</td>
              </tr>
            </tbody>
          </table>
          {isPreview && (
            <p className="mt-2.5 text-[11px] text-slate-400">
              One-time and yearly items are billed only on the applicable invoice; every-term items are billed each term.
            </p>
          )}

          {/* Payment guidelines — only shown when the school has set them */}
          {school?.feePaymentGuidelines?.trim() && (
            <div className="mt-5 p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">Payment Guidelines</h4>
              <p className="text-xs text-slate-600 whitespace-pre-line leading-relaxed">{school.feePaymentGuidelines.trim()}</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2 mt-5">
        <button
          onClick={onClose}
          className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition">
          Close
        </button>
        <button
          onClick={() => printHtml(buildInvoiceHtml(data, school ?? null))}
          className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition"
          style={{ backgroundColor: 'var(--accent)' }}>
          Print / Save as PDF
        </button>
      </div>
    </Modal>
  );
}
