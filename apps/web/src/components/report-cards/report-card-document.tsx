'use client';

// On-screen report card — mirrors the server PDF so what you preview is what you
// download. Driven entirely by the getStudentReportCard payload + school profile.

export type ReportCardData = {
  student: { id: string; studentId: string; firstName: string; lastName: string };
  term: { id: string; name: string; academicYear: { id: string; name: string } };
  className: string | null;
  config: {
    showRawScore?: boolean;
    showGradeLabel?: boolean;
    showAttendanceSummary?: boolean;
    showBehaviourScores?: boolean;
    showTeacherComments?: boolean;
    showPrincipalComments?: boolean;
    showNextTermInfo?: boolean;
    showPosition?: boolean;
    footerText?: string | null;
    customSections?: { id: string; label: string }[];
  } | null;
  subjects: {
    subjectId: string;
    subject: string;
    sbaPercent: number | null;
    examPercent: number | null;
    sbaScore: number;
    examScore: number;
    total: number;
    gradeLabel: string | null;
    remark: string | null;
  }[];
  overallGrade: string | null;
  aggregate: number;
  position: number | null;
  classSize: number | null;
  conduct: {
    attitudes: string | null;
    interests: string | null;
    conduct: string | null;
    teacherRemarks: string | null;
    headTeacherRemarks: string | null;
    promotedTo: string | null;
  } | null;
  publishedAt: string | null;
  attendance: { totalDays: number; presentDays: number; absentDays: number; rate: number };
};

export type SchoolHeader = {
  name: string;
  address?: string | null;
  phone?: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
};

export function ReportCardDocument({ data, school }: { data: ReportCardData; school: SchoolHeader }) {
  const accent = school.primaryColor || '#1a56db';
  const cfg = data.config ?? {};
  const showGrade = cfg.showGradeLabel ?? true;
  const showPosition = cfg.showPosition ?? true;

  return (
    <div className="bg-white text-slate-900 mx-auto w-full max-w-[820px] p-8 sm:p-10" style={{ fontSize: 13 }}>
      {/* Header */}
      <div className="text-center">
        {school.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={school.logoUrl} alt="" className="mx-auto mb-2 h-14 w-14 object-contain" />
        )}
        <h1 className="text-2xl font-bold" style={{ color: accent }}>{school.name}</h1>
        {school.address && <p className="text-xs text-slate-500">{school.address}</p>}
        {school.phone && <p className="text-xs text-slate-500">{school.phone}</p>}
        <h2 className="mt-2 text-base font-bold tracking-wide">Terminal Report Card</h2>
        <div className="mt-2 h-[2px] w-full" style={{ backgroundColor: accent }} />
      </div>

      {/* Student / term info */}
      <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
        <p><span className="font-semibold">Name:</span> {data.student.firstName} {data.student.lastName}</p>
        <p><span className="font-semibold">Academic Year:</span> {data.term.academicYear.name}</p>
        <p><span className="font-semibold">Student ID:</span> {data.student.studentId}</p>
        <p><span className="font-semibold">Term:</span> {data.term.name}</p>
        {data.className && <p><span className="font-semibold">Class:</span> {data.className}</p>}
      </div>

      {/* Subjects */}
      <table className="mt-5 w-full border-collapse text-sm">
        <thead>
          <tr style={{ backgroundColor: accent }} className="text-white">
            <th className="px-3 py-2 text-left font-semibold">Subject</th>
            <th className="px-3 py-2 text-center font-semibold">Class&nbsp;(SBA)</th>
            <th className="px-3 py-2 text-center font-semibold">Exam</th>
            <th className="px-3 py-2 text-center font-semibold">Total</th>
            {showGrade && <th className="px-3 py-2 text-center font-semibold">Grade</th>}
            {showGrade && <th className="px-3 py-2 text-left font-semibold">Remark</th>}
          </tr>
        </thead>
        <tbody>
          {data.subjects.map((s, i) => (
            <tr key={s.subjectId} className={i % 2 ? 'bg-slate-50' : ''}>
              <td className="px-3 py-1.5 border-b border-slate-100">{s.subject}</td>
              <td className="px-3 py-1.5 border-b border-slate-100 text-center">{s.sbaPercent != null ? s.sbaScore : '—'}</td>
              <td className="px-3 py-1.5 border-b border-slate-100 text-center">{s.examPercent != null ? s.examScore : '—'}</td>
              <td className="px-3 py-1.5 border-b border-slate-100 text-center font-semibold">{s.total}</td>
              {showGrade && <td className="px-3 py-1.5 border-b border-slate-100 text-center font-semibold">{s.gradeLabel ?? '—'}</td>}
              {showGrade && <td className="px-3 py-1.5 border-b border-slate-100 text-slate-500">{s.remark ?? ''}</td>}
            </tr>
          ))}
          {data.subjects.length === 0 && (
            <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400 border-b border-slate-100">No scored subjects for this term yet.</td></tr>
          )}
        </tbody>
      </table>

      {/* Summary */}
      <div className="mt-3 flex flex-wrap gap-x-8 gap-y-1 text-sm font-semibold">
        <span>Overall: {data.aggregate}%</span>
        {showGrade && data.overallGrade && <span>Grade: {data.overallGrade}</span>}
        {showPosition && data.position != null && (
          <span>Position: {data.position}{data.classSize ? ` of ${data.classSize}` : ''}</span>
        )}
        {data.conduct?.promotedTo && <span>Promoted to: {data.conduct.promotedTo}</span>}
      </div>

      {/* Attendance */}
      {(cfg.showAttendanceSummary ?? true) && (
        <div className="mt-4">
          <h3 className="text-sm font-bold" style={{ color: accent }}>Attendance Summary</h3>
          <p className="mt-1 text-sm text-slate-600">
            Present: {data.attendance.presentDays} / {data.attendance.totalDays} · Absent: {data.attendance.absentDays} · Rate: {data.attendance.rate}%
          </p>
        </div>
      )}

      {/* Attitudes / Interests / Conduct */}
      {(cfg.showBehaviourScores ?? false) && data.conduct &&
        (data.conduct.attitudes || data.conduct.interests || data.conduct.conduct) && (
        <div className="mt-4">
          <h3 className="text-sm font-bold" style={{ color: accent }}>Attitudes, Interests &amp; Conduct</h3>
          <div className="mt-1 space-y-0.5 text-sm text-slate-600">
            {data.conduct.attitudes && <p><span className="font-semibold">Attitudes:</span> {data.conduct.attitudes}</p>}
            {data.conduct.interests && <p><span className="font-semibold">Interests:</span> {data.conduct.interests}</p>}
            {data.conduct.conduct && <p><span className="font-semibold">Conduct:</span> {data.conduct.conduct}</p>}
          </div>
        </div>
      )}

      {/* Remarks */}
      {(cfg.showTeacherComments ?? true) && (
        <RemarkBox accent={accent} label="Class Teacher's Comments" text={data.conduct?.teacherRemarks} />
      )}
      {(cfg.showPrincipalComments ?? true) && (
        <RemarkBox accent={accent} label="Head Teacher's Comments" text={data.conduct?.headTeacherRemarks} />
      )}

      {/* Footer */}
      {cfg.footerText && (
        <p className="mt-6 text-center text-xs italic text-slate-400">{cfg.footerText}</p>
      )}
    </div>
  );
}

function RemarkBox({ accent, label, text }: { accent: string; label: string; text?: string | null }) {
  return (
    <div className="mt-4">
      <h3 className="text-sm font-bold" style={{ color: accent }}>{label}</h3>
      <div className="mt-1 min-h-[44px] rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
        {text || ''}
      </div>
    </div>
  );
}
