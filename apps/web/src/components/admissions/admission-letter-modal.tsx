'use client';

import { useCallback } from 'react';
import { staffApi } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { Modal } from '@/components/ui/modal';
import {
  DEFAULT_ADMISSION_LETTER_TEMPLATE,
  buildLetterValues,
  applyLetterTemplate,
  type AdmissionLetterSource,
} from '@/lib/admission-letter';

// A printable admission/acceptance letter. The body comes from the school's
// editable template (with {{merge}} tokens) and is filled from the admission
// record; the school letterhead + date are added by this document shell.

export type AdmissionLetterData = AdmissionLetterSource & {
  applicantName: string;
};

type SchoolProfile = {
  name: string;
  address: string | null;
  phone: string | null;
  email?: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  admissionLetterTemplate?: string | null;
};

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function todayLong() {
  return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function mergedBody(d: AdmissionLetterData, school: SchoolProfile | null): string {
  const template = school?.admissionLetterTemplate?.trim() || DEFAULT_ADMISSION_LETTER_TEMPLATE;
  const values = buildLetterValues(d, school?.name || 'School');
  return applyLetterTemplate(template, values);
}

function buildLetterHtml(d: AdmissionLetterData, school: SchoolProfile | null) {
  const accent = school?.primaryColor || '#065f46';
  const body = mergedBody(d, school);
  const contactBits = [school?.address, school?.phone, school?.email]
    .filter((v): v is string => !!v)
    .map(escapeHtml)
    .join(' &middot; ');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Admission Letter — ${escapeHtml(d.applicantName)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Times New Roman', Georgia, serif; margin: 0; color: #1e293b; }
  .wrap { max-width: 640px; margin: 0 auto; padding: 48px 44px; }
  .header { display: flex; align-items: center; gap: 14px; border-bottom: 2px solid ${accent}; padding-bottom: 18px; }
  .header img { height: 56px; width: 56px; object-fit: contain; border-radius: 8px; }
  .school-name { font-size: 22px; font-weight: 700; color: ${accent}; margin: 0; letter-spacing: 0.3px; }
  .school-contact { font-size: 11px; color: #64748b; margin-top: 3px; font-family: Arial, sans-serif; }
  .meta { margin: 22px 0 26px; font-size: 13px; color: #475569; }
  .title { text-align: center; font-size: 15px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: ${accent}; margin: 18px 0 24px; }
  .body { font-size: 15px; line-height: 1.7; white-space: pre-line; }
  .footer { margin-top: 36px; font-size: 10px; color: #94a3b8; font-family: Arial, sans-serif; text-align: center; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .wrap { padding: 28px; } }
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

    <p class="title">Letter of Admission</p>
    <div class="meta">${escapeHtml(todayLong())}</div>
    <div class="body">${escapeHtml(body)}</div>

    <div class="footer">${escapeHtml(school?.name || 'School')} &middot; This is an official admission letter.</div>
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

export function AdmissionLetterModal({ data, onClose }: { data: AdmissionLetterData | null; onClose: () => void }) {
  const fetchProfile = useCallback(() => staffApi.get<SchoolProfile>('/school/profile').catch(() => null), []);
  const { data: school } = useApi(fetchProfile);

  if (!data) return null;

  const body = mergedBody(data, school ?? null);

  return (
    <Modal open={!!data} onClose={onClose} title="Admission Letter" width="max-w-2xl">
      <div className="rounded-xl border border-slate-100 overflow-hidden bg-white">
        {/* Letterhead */}
        <div className="flex items-center gap-3 px-6 pt-6 pb-4 border-b-2" style={{ borderColor: 'var(--accent)' }}>
          {school?.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={school.logoUrl} alt="" className="h-12 w-12 object-contain rounded-lg" />
          )}
          <div>
            <p className="text-lg font-bold" style={{ color: 'var(--accent)' }}>{school?.name ?? 'School'}</p>
            {(school?.address || school?.phone || school?.email) && (
              <p className="text-[11px] text-slate-400">
                {[school?.address, school?.phone, school?.email].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        </div>

        {/* Letter body */}
        <div className="px-6 py-6">
          <p className="text-center text-sm font-bold uppercase tracking-wider mb-5" style={{ color: 'var(--accent)' }}>
            Letter of Admission
          </p>
          <p className="text-xs text-slate-500 mb-5">{todayLong()}</p>
          <div className="text-[15px] leading-relaxed text-slate-700 whitespace-pre-line font-serif">{body}</div>
        </div>
      </div>

      <div className="flex gap-2 mt-5">
        <button
          onClick={onClose}
          className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition">
          Close
        </button>
        <button
          onClick={() => printHtml(buildLetterHtml(data, school ?? null))}
          className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition"
          style={{ backgroundColor: 'var(--accent)' }}>
          Print / Save as PDF
        </button>
      </div>
    </Modal>
  );
}
