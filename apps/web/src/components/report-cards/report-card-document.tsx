'use client';

// On-screen report card — mirrors the server PDF so what you preview is what you
// download. Driven entirely by the getStudentReportCard payload + school profile.

export type ProficiencyLevel = { id: string; code: string; label: string; description?: string | null };
export type HolisticSkill = { id: string; label: string; groupLabel?: string | null };
export type GradingBand = { label: string; minScore: number; maxScore: number; remark?: string | null };

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
    reportCardLayout?: 'STANDARD' | 'HOLISTIC';
    showAssessmentScale?: boolean;
    showMetricsTable?: boolean;
    footerText?: string | null;
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
  assessmentScale?: { levels: ProficiencyLevel[]; skills: HolisticSkill[] } | null;
  gradingBands?: GradingBand[] | null;
  holistic?: Record<string, string> | null;
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
  const holistic = cfg.reportCardLayout === 'HOLISTIC';

  const header = <Header data={data} school={school} accent={accent} />;
  const subjects = <SubjectsTable data={data} accent={accent} />;
  const summary = <Summary data={data} cfg={cfg} />;
  const scale = (cfg.showAssessmentScale ?? false) ? <AssessmentScale data={data} accent={accent} /> : null;
  const metrics = (cfg.showMetricsTable ?? false) ? <MetricsTable data={data} accent={accent} /> : null;
  const attendance = (cfg.showAttendanceSummary ?? true) ? <Attendance data={data} accent={accent} /> : null;
  const conduct = (cfg.showBehaviourScores ?? false) ? <Conduct data={data} accent={accent} /> : null;
  const remarks = (
    <>
      {(cfg.showTeacherComments ?? true) && <RemarkBox accent={accent} label="Class Teacher's Comments" text={data.conduct?.teacherRemarks} />}
      {(cfg.showPrincipalComments ?? true) && <RemarkBox accent={accent} label="Head Teacher's Comments" text={data.conduct?.headTeacherRemarks} />}
    </>
  );
  const footer = cfg.footerText ? <p className="mt-6 text-center text-xs italic text-slate-400">{cfg.footerText}</p> : null;

  return (
    <div className="bg-white text-slate-900 mx-auto w-full max-w-[820px] p-8 sm:p-10" style={{ fontSize: 13 }}>
      {header}
      {holistic ? (
        // Holistic layout — scale + holistic table up top, then subjects/metrics.
        <>
          {scale}
          {subjects}
          {summary}
          {metrics}
          {attendance}
          {conduct}
          {remarks}
        </>
      ) : (
        // Standard layout — subjects first; scale/metrics appended if enabled.
        <>
          {subjects}
          {summary}
          {attendance}
          {scale}
          {metrics}
          {conduct}
          {remarks}
        </>
      )}
      {footer}
    </div>
  );
}

function Header({ data, school, accent }: { data: ReportCardData; school: SchoolHeader; accent: string }) {
  return (
    <>
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
      <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
        <p><span className="font-semibold">Name:</span> {data.student.firstName} {data.student.lastName}</p>
        <p><span className="font-semibold">Academic Year:</span> {data.term.academicYear.name}</p>
        <p><span className="font-semibold">Student ID:</span> {data.student.studentId}</p>
        <p><span className="font-semibold">Term:</span> {data.term.name}</p>
        {data.className && <p><span className="font-semibold">Class:</span> {data.className}</p>}
      </div>
    </>
  );
}

function SubjectsTable({ data, accent }: { data: ReportCardData; accent: string }) {
  const showGrade = data.config?.showGradeLabel ?? true;
  return (
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
  );
}

function Summary({ data, cfg }: { data: ReportCardData; cfg: NonNullable<ReportCardData['config']> }) {
  const showGrade = cfg.showGradeLabel ?? true;
  const showPosition = cfg.showPosition ?? true;
  return (
    <div className="mt-3 flex flex-wrap gap-x-8 gap-y-1 text-sm font-semibold">
      <span>Overall: {data.aggregate}%</span>
      {showGrade && data.overallGrade && <span>Grade: {data.overallGrade}</span>}
      {showPosition && data.position != null && (
        <span>Position: {data.position}{data.classSize ? ` of ${data.classSize}` : ''}</span>
      )}
      {data.conduct?.promotedTo && <span>Promoted to: {data.conduct.promotedTo}</span>}
    </div>
  );
}

function Attendance({ data, accent }: { data: ReportCardData; accent: string }) {
  return (
    <div className="mt-4">
      <h3 className="text-sm font-bold" style={{ color: accent }}>Attendance Summary</h3>
      <p className="mt-1 text-sm text-slate-600">
        Present: {data.attendance.presentDays} / {data.attendance.totalDays} · Absent: {data.attendance.absentDays} · Rate: {data.attendance.rate}%
      </p>
    </div>
  );
}

// Assessment Scale = proficiency legend + Holistic Development ratings table.
function AssessmentScale({ data, accent }: { data: ReportCardData; accent: string }) {
  const scale = data.assessmentScale;
  if (!scale || scale.levels.length === 0 || scale.skills.length === 0) return null;
  const ratings = data.holistic ?? {};
  const group = scale.skills[0]?.groupLabel || 'Holistic Development';

  return (
    <div className="mt-5">
      <h3 className="text-sm font-bold" style={{ color: accent }}>Assessment Scale</h3>
      <ul className="mt-1 mb-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 text-xs text-slate-600">
        {scale.levels.map((l) => (
          <li key={l.id}><span className="font-semibold">{l.code} {l.label}</span>{l.description ? ` — ${l.description}` : ''}</li>
        ))}
      </ul>

      <h4 className="text-sm font-semibold text-slate-700">{group}</h4>
      <table className="mt-1 w-full border-collapse text-sm">
        <thead>
          <tr className="bg-slate-50 text-slate-500">
            <th className="px-3 py-1.5 text-left font-semibold">Skill</th>
            {scale.levels.map((l) => (
              <th key={l.id} className="px-2 py-1.5 text-center font-semibold w-12">{l.code}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {scale.skills.map((sk) => {
            const chosen = ratings[sk.id];
            return (
              <tr key={sk.id}>
                <td className="px-3 py-1.5 border-b border-slate-100">{sk.label}</td>
                {scale.levels.map((l) => (
                  <td key={l.id} className="px-2 py-1.5 border-b border-slate-100 text-center">
                    {chosen === l.code ? <span style={{ color: accent }}>●</span> : ''}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Metrics table = the grade-band key (from the school's grading scale).
function MetricsTable({ data, accent }: { data: ReportCardData; accent: string }) {
  const bands = data.gradingBands ?? [];
  if (bands.length === 0) return null;
  return (
    <div className="mt-5">
      <h3 className="text-sm font-bold" style={{ color: accent }}>Metrics</h3>
      <div className="mt-1 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1 text-sm">
        {bands.map((b, i) => (
          <div key={i} className="flex items-baseline gap-2">
            <span className="font-semibold w-6">{b.label}</span>
            <span className="text-slate-500">{b.minScore}–{b.maxScore}%</span>
            {b.remark && <span className="text-slate-400">{b.remark}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function Conduct({ data, accent }: { data: ReportCardData; accent: string }) {
  const c = data.conduct;
  if (!c || (!c.attitudes && !c.interests && !c.conduct)) return null;
  return (
    <div className="mt-4">
      <h3 className="text-sm font-bold" style={{ color: accent }}>Attitudes, Interests &amp; Conduct</h3>
      <div className="mt-1 space-y-0.5 text-sm text-slate-600">
        {c.attitudes && <p><span className="font-semibold">Attitudes:</span> {c.attitudes}</p>}
        {c.interests && <p><span className="font-semibold">Interests:</span> {c.interests}</p>}
        {c.conduct && <p><span className="font-semibold">Conduct:</span> {c.conduct}</p>}
      </div>
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
