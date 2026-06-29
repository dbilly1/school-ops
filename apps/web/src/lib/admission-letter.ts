// Admission-letter template + merge-token helpers, shared by the letter modal
// and the settings editor so the token list and default wording stay in sync.

export type AdmissionLetterTokenKey =
  | 'applicantName'
  | 'firstName'
  | 'lastName'
  | 'class'
  | 'academicYear'
  | 'reportingDate'
  | 'guardianName'
  | 'schoolName'
  | 'date';

// Tokens the template may use; shown as a reference in the settings editor.
export const ADMISSION_LETTER_TOKENS: { token: string; desc: string }[] = [
  { token: '{{applicantName}}', desc: "Applicant's full name" },
  { token: '{{firstName}}', desc: 'First name' },
  { token: '{{lastName}}', desc: 'Last name' },
  { token: '{{class}}', desc: 'Admitted class' },
  { token: '{{academicYear}}', desc: 'Academic year' },
  { token: '{{reportingDate}}', desc: 'Reporting / resumption date' },
  { token: '{{guardianName}}', desc: 'Parent / guardian name' },
  { token: '{{schoolName}}', desc: 'School name' },
  { token: '{{date}}', desc: "Today's date (letter date)" },
];

// Built-in default used when the school hasn't set its own template. The header
// (logo, school name, contact) and the letter date are added by the document
// shell, so the template is just the body.
export const DEFAULT_ADMISSION_LETTER_TEMPLATE = `Dear Parent/Guardian,

We are pleased to inform you that {{applicantName}} has been offered admission to {{schoolName}} for the {{academicYear}} academic year.

Your ward has been admitted into {{class}} and is expected to report on {{reportingDate}}.

To confirm this placement, kindly complete the enrolment formalities and settle the required fees on or before the reporting date. Please present this letter together with all requested documents on the reporting day.

We look forward to welcoming {{applicantName}} into our school community.

Yours faithfully,



__________________________
Head of School`;

export type AdmissionLetterSource = {
  formData: Record<string, unknown>;
  reportingDate: string | null;
  admittedClass: { id: string; name: string } | null;
  academicYear: { id: string; name: string } | null;
};

function str(v: unknown): string {
  return v == null ? '' : String(v).trim();
}

function fmtDate(d: string | Date) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Resolve every token's value from the admission record + school. Missing
// values fall back to a readable placeholder so the letter still reads cleanly.
export function buildLetterValues(
  src: AdmissionLetterSource,
  schoolName: string,
): Record<AdmissionLetterTokenKey, string> {
  const fd = src.formData ?? {};
  const firstName = str(fd.firstName);
  const lastName = str(fd.lastName);
  const fullName = `${firstName} ${lastName}`.trim() || 'the applicant';
  // Guardian name lives under a school-configurable key — try the common ones.
  const guardian =
    str(fd.guardianName) || str(fd.parentName) || str(fd.guardian) || str(fd.fatherName) || str(fd.motherName);

  return {
    applicantName: fullName,
    firstName: firstName || fullName,
    lastName,
    class: src.admittedClass?.name ?? '',
    academicYear: src.academicYear?.name ?? '',
    reportingDate: src.reportingDate ? fmtDate(src.reportingDate) : '(to be confirmed)',
    guardianName: guardian || 'Parent/Guardian',
    schoolName,
    date: fmtDate(new Date()),
  };
}

// Replace {{token}} occurrences with their values. Unknown tokens are left
// in place so a typo is visible rather than silently dropped.
export function applyLetterTemplate(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, key: string) =>
    key in values ? values[key] : whole,
  );
}
