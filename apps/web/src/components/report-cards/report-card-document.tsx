'use client';

// On-screen report card — mirrors the server PDF so what you preview is what you
// download. Two layouts: STANDARD (clean) and HOLISTIC (branded, boxed tables).

export type ProficiencyLevel = { id: string; code: string; label: string; description?: string | null };
export type HolisticSkill = { id: string; label: string; groupLabel?: string | null };
export type GradingBand = { label: string; minScore: number; maxScore: number; remark?: string | null };

export type ReportCardData = {
  student: { id: string; studentId: string; firstName: string; lastName: string };
  term: { id: string; name: string; academicYear: { id: string; name: string } };
  className: string | null;
  classTeacherName?: string | null;
  vacationDate?: string | null;
  nextTermReopens?: string | null;
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
  email?: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
};

function fmtDate(value?: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

// 1 → 1st, 2 → 2nd, 3 → 3rd, 11 → 11th, etc.
function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

export function ReportCardDocument({ data, school }: { data: ReportCardData; school: SchoolHeader }) {
  const accent = school.primaryColor || '#1a56db';
  const cfg = data.config ?? {};
  const scaleOn = (cfg.showAssessmentScale ?? false) && !!data.assessmentScale?.levels?.length && !!data.assessmentScale?.skills?.length;
  const metricsOn = (cfg.showMetricsTable ?? false) && !!data.gradingBands?.length;

  return cfg.reportCardLayout === 'HOLISTIC'
    ? <HolisticLayout data={data} school={school} accent={accent} scaleOn={scaleOn} metricsOn={metricsOn} />
    : <StandardLayout data={data} school={school} accent={accent} scaleOn={scaleOn} metricsOn={metricsOn} />;
}

// ── Standard (clean) layout ───────────────────────────────────────────────────

function StandardLayout({ data, school, accent, scaleOn, metricsOn }: LayoutProps) {
  const cfg = data.config ?? {};
  return (
    <div className="bg-white text-slate-900 mx-auto w-full max-w-[820px] p-8 sm:p-10" style={{ fontSize: 13 }}>
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
        {fmtDate(data.vacationDate) && <p><span className="font-semibold">Vacation:</span> {fmtDate(data.vacationDate)}</p>}
        {fmtDate(data.nextTermReopens) && <p><span className="font-semibold">Next Term Begins:</span> {fmtDate(data.nextTermReopens)}</p>}
      </div>

      <SubjectsTable data={data} accent={accent} filledHeader />
      <Summary data={data} cfg={cfg} />
      {(cfg.showAttendanceSummary ?? true) && <Attendance data={data} accent={accent} />}
      {scaleOn && <div className="mt-6"><AssessmentScaleTable data={data} accent={accent} /></div>}
      {scaleOn && <div className="mt-6"><HolisticTable data={data} accent={accent} /></div>}
      {metricsOn && <div className="mt-6"><MetricsTable data={data} accent={accent} /></div>}
      {(cfg.showBehaviourScores ?? false) && <Conduct data={data} accent={accent} />}
      {(cfg.showTeacherComments ?? true) && <RemarkBox accent={accent} label="Class Teacher's Comments" text={data.conduct?.teacherRemarks} />}
      {(cfg.showPrincipalComments ?? true) && <RemarkBox accent={accent} label="Head Teacher's Comments" text={data.conduct?.headTeacherRemarks} />}
      {cfg.footerText && <p className="mt-6 text-center text-xs italic text-slate-400">{cfg.footerText}</p>}
    </div>
  );
}

// ── Holistic (branded, boxed) layout — modelled on the school sample ───────────

function HolisticLayout({ data, school, accent, scaleOn, metricsOn }: LayoutProps) {
  const cfg = data.config ?? {};
  return (
    <div className="bg-white text-slate-900 mx-auto w-full max-w-[820px]" style={{ fontSize: 12.5 }}>
      {/* Brand header band */}
      <div className="flex items-stretch text-white" style={{ backgroundColor: accent }}>
        <div className="w-3 shrink-0" style={{ backgroundColor: '#f59e0b' }} />
        <div className="flex flex-1 items-center gap-4 px-5 py-3">
          {school.logoUrl && (
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={school.logoUrl} alt="" className="h-11 w-11 object-contain" />
            </span>
          )}
          <div className="flex-1">
            <p className="text-lg font-extrabold uppercase tracking-wide leading-tight">{school.name}</p>
            {school.address && <p className="text-[11px] opacity-90">{school.address}</p>}
          </div>
          <div className="text-[11px] text-right leading-snug opacity-95">
            {school.phone && <p>{school.phone}</p>}
            {school.email && <p>{school.email}</p>}
          </div>
        </div>
      </div>

      <div className="p-6 sm:p-8">
        {/* Student info box */}
        <table className="w-full border-collapse text-sm">
          <tbody>
            <tr>
              <Cell><b>Name:</b> {data.student.firstName} {data.student.lastName}</Cell>
              <Cell><b>Class:</b> {data.className ?? '—'}</Cell>
            </tr>
            <tr>
              <Cell><b>Academic Year/Term:</b> {data.term.academicYear.name} – {data.term.name}</Cell>
              <Cell><b>Vacation:</b> {fmtDate(data.vacationDate) || '—'}</Cell>
            </tr>
            <tr>
              <Cell><b>Class Teacher:</b> {data.classTeacherName ?? '—'}</Cell>
              <Cell><b>Next Term Begins:</b> {fmtDate(data.nextTermReopens) || '—'}</Cell>
            </tr>
          </tbody>
        </table>

        {scaleOn && <div className="mt-5"><AssessmentScaleTable data={data} accent={accent} /></div>}
        {scaleOn && <div className="mt-4"><HolisticTable data={data} accent={accent} /></div>}

        <div className="mt-5"><SubjectsTable data={data} accent={accent} /></div>
        <Summary data={data} cfg={cfg} />

        {metricsOn && <div className="mt-5"><MetricsTable data={data} accent={accent} /></div>}
        {(cfg.showAttendanceSummary ?? true) && <Attendance data={data} accent={accent} />}
        {(cfg.showBehaviourScores ?? false) && <Conduct data={data} accent={accent} />}
        {(cfg.showTeacherComments ?? true) && <RemarkBox accent={accent} label="Class Teacher's Comments" text={data.conduct?.teacherRemarks} />}
        {(cfg.showPrincipalComments ?? true) && <RemarkBox accent={accent} label="Head Teacher's Comments" text={data.conduct?.headTeacherRemarks} />}
      </div>

      {/* Footer motto band */}
      <div className="text-center text-white text-sm font-semibold tracking-[0.3em] uppercase py-2.5" style={{ backgroundColor: accent }}>
        {cfg.footerText || ''}
      </div>
    </div>
  );
}

type LayoutProps = { data: ReportCardData; school: SchoolHeader; accent: string; scaleOn: boolean; metricsOn: boolean };

// ── Shared section components ─────────────────────────────────────────────────

const BORDER = 'border border-slate-300';
function Cell({ children }: { children: React.ReactNode }) {
  return <td className={`${BORDER} px-3 py-1.5 align-top`}>{children}</td>;
}
function SectionTitle({ children, span, accent }: { children: React.ReactNode; span: number; accent: string }) {
  return (
    <tr>
      <th colSpan={span} className={`${BORDER} px-3 py-1.5 text-center font-bold uppercase tracking-wide`} style={{ color: accent }}>
        {children}
      </th>
    </tr>
  );
}

function SubjectsTable({ data, accent, filledHeader }: { data: ReportCardData; accent: string; filledHeader?: boolean }) {
  const showGrade = data.config?.showGradeLabel ?? true;
  const headStyle = filledHeader ? { backgroundColor: accent } : undefined;
  const headCls = filledHeader ? 'text-white' : 'text-slate-700';
  return (
    <table className={`${filledHeader ? 'mt-5' : ''} w-full border-collapse text-sm`}>
      <thead>
        <tr style={headStyle} className={headCls}>
          <th className={`${BORDER} px-3 py-2 text-left font-semibold`}>Subject</th>
          <th className={`${BORDER} px-3 py-2 text-center font-semibold`}>Class Score</th>
          <th className={`${BORDER} px-3 py-2 text-center font-semibold`}>Exam Score</th>
          <th className={`${BORDER} px-3 py-2 text-center font-semibold`}>Total</th>
          {showGrade && <th className={`${BORDER} px-3 py-2 text-center font-semibold`}>Grade</th>}
          {showGrade && <th className={`${BORDER} px-3 py-2 text-left font-semibold`}>Remark</th>}
        </tr>
      </thead>
      <tbody>
        {data.subjects.map((s) => (
          <tr key={s.subjectId}>
            <td className={`${BORDER} px-3 py-1.5`}>{s.subject}</td>
            <td className={`${BORDER} px-3 py-1.5 text-center`}>{s.sbaPercent != null ? s.sbaScore : '—'}</td>
            <td className={`${BORDER} px-3 py-1.5 text-center`}>{s.examPercent != null ? s.examScore : '—'}</td>
            <td className={`${BORDER} px-3 py-1.5 text-center font-semibold`}>{s.total}</td>
            {showGrade && <td className={`${BORDER} px-3 py-1.5 text-center font-semibold`}>{s.gradeLabel ?? '—'}</td>}
            {showGrade && <td className={`${BORDER} px-3 py-1.5`}>{s.remark ?? ''}</td>}
          </tr>
        ))}
        {data.subjects.length === 0 && (
          <tr><td colSpan={6} className={`${BORDER} px-3 py-6 text-center text-slate-400`}>No scored subjects for this term yet.</td></tr>
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
        <span>Position: {ordinal(data.position)}</span>
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

// Assessment Scale legend as a bordered table.
function AssessmentScaleTable({ data, accent }: { data: ReportCardData; accent: string }) {
  const levels = data.assessmentScale?.levels ?? [];
  if (levels.length === 0) return null;
  return (
    <table className="w-full border-collapse text-sm">
      <thead><SectionTitle span={3} accent={accent}>Assessment Scale</SectionTitle></thead>
      <tbody>
        {levels.map((l) => (
          <tr key={l.id}>
            <td className={`${BORDER} px-3 py-1.5 text-center font-bold w-12`}>{l.code}</td>
            <td className={`${BORDER} px-3 py-1.5 font-medium w-48`}>{l.label}</td>
            <td className={`${BORDER} px-3 py-1.5 text-slate-600`}>{l.description ?? ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Holistic Development ratings as a bordered table (✓ in the chosen level).
function HolisticTable({ data, accent }: { data: ReportCardData; accent: string }) {
  const scale = data.assessmentScale;
  if (!scale?.levels?.length || !scale?.skills?.length) return null;
  const ratings = data.holistic ?? {};
  const group = scale.skills[0]?.groupLabel || 'Holistic Development';
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="text-slate-700">
          <th className={`${BORDER} px-3 py-1.5 text-left font-bold`}>{group}</th>
          {scale.levels.map((l) => (
            <th key={l.id} className={`${BORDER} px-2 py-1.5 text-center font-semibold w-12`}>{l.code}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {scale.skills.map((sk) => (
          <tr key={sk.id}>
            <td className={`${BORDER} px-3 py-1.5`}>{sk.label}</td>
            {scale.levels.map((l) => (
              <td key={l.id} className={`${BORDER} px-2 py-1.5 text-center`} style={{ color: accent }}>
                {ratings[sk.id] === l.code ? '✓' : ''}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Metrics = grade-band key as a bordered table.
function MetricsTable({ data, accent }: { data: ReportCardData; accent: string }) {
  const bands = data.gradingBands ?? [];
  if (bands.length === 0) return null;
  return (
    <table className="w-full border-collapse text-sm sm:w-2/3">
      <thead><SectionTitle span={3} accent={accent}>Metrics</SectionTitle></thead>
      <tbody>
        {bands.map((b, i) => (
          <tr key={i}>
            <td className={`${BORDER} px-3 py-1.5 text-center font-bold w-12`}>{b.label}</td>
            <td className={`${BORDER} px-3 py-1.5 w-28`}>{b.minScore}–{b.maxScore}%</td>
            <td className={`${BORDER} px-3 py-1.5 text-slate-600`}>{b.remark ?? ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
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
