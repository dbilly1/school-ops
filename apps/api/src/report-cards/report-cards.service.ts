import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, AssessmentCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GradingService } from '../school-setup/grading/grading.service';
import { NotificationsService } from '../notifications/notifications.service';
import { isExamCategory } from '../assessments/assessment-category.util';
import { DEFAULT_LEVELS, DEFAULT_SKILLS } from '../school-setup/report-card-config/report-card-config.service';
import { GenerateReportCardsDto, PublishReportCardsDto, UpdateReportCardDto } from './dto/report-card.dto';

// Per-subject computed terminal result.
type SubjectResult = {
  subjectId: string;
  subject: string;
  sbaRaw: number;
  sbaTotal: number;
  sbaPercent: number | null;
  examRaw: number;
  examTotal: number;
  examPercent: number | null;
  sbaScore: number; // sbaPercent scaled to the SBA weight (e.g. 0–50)
  examScore: number; // examPercent scaled to the exam weight (e.g. 0–50)
  total: number | null; // 0–100, or null when the subject has no scores yet
  gradeLabel: string | null;
  remark: string | null;
};

@Injectable()
export class ReportCardsService {
  constructor(
    private prisma: PrismaService,
    private grading: GradingService,
    private notifications: NotificationsService,
  ) {}

  // ── Computation ───────────────────────────────────────────

  // Aggregate = average of subjects that actually have a score (unscored
  // subjects are listed on the card but excluded here).
  private aggregateOf(subjects: SubjectResult[]): number {
    const scored = subjects.filter((r) => r.total !== null) as Array<SubjectResult & { total: number }>;
    return scored.length > 0 ? this.round(scored.reduce((s, r) => s + r.total, 0) / scored.length) : 0;
  }

  private round(n: number, dp = 1): number {
    const f = 10 ** dp;
    return Math.round(n * f) / f;
  }

  // Compute every subject's terminal result for one student in one term.
  private async computeSubjects(
    schoolId: string,
    studentId: string,
    termId: string,
    gradeLevelId: string | undefined,
    categoryWeights: Map<AssessmentCategory, number>,
    sbaWeight: number,
    examWeight: number,
  ): Promise<SubjectResult[]> {
    const scores = await this.prisma.assessmentScore.findMany({
      where: { studentId, assessment: { schoolId, termId } },
      include: { assessment: { include: { subject: { select: { id: true, name: true } } } } },
    });

    type Acc = {
      name: string;
      sbaByCat: Map<AssessmentCategory, { raw: number; total: number }>;
      exam: { raw: number; total: number };
    };
    const bySubject = new Map<string, Acc>();

    for (const s of scores) {
      const a = s.assessment;
      const subjectId = a.subjectId;
      if (!bySubject.has(subjectId)) {
        bySubject.set(subjectId, { name: a.subject.name, sbaByCat: new Map(), exam: { raw: 0, total: 0 } });
      }
      const acc = bySubject.get(subjectId)!;
      const raw = Number(s.rawScore);
      const total = Number(a.totalScore);

      if (isExamCategory(a.category)) {
        acc.exam.raw += raw;
        acc.exam.total += total;
      } else {
        const cur = acc.sbaByCat.get(a.category) ?? { raw: 0, total: 0 };
        cur.raw += raw;
        cur.total += total;
        acc.sbaByCat.set(a.category, cur);
      }
    }

    const hasConfiguredWeights = categoryWeights.size > 0;
    const results: SubjectResult[] = [];

    // List every subject the class/grade level takes (so unscored courses still
    // appear, blank), unioned with any subject the student happens to have scores
    // in. Subjects with no scores get a blank row and are excluded from the
    // aggregate (their total is null).
    const subjectNames = new Map<string, string>();
    if (gradeLevelId) {
      const gradeSubjects = await this.prisma.gradeLevelSubject.findMany({
        where: { gradeLevelId },
        include: { subject: { select: { id: true, name: true } } },
      });
      for (const gs of gradeSubjects) subjectNames.set(gs.subject.id, gs.subject.name);
    }
    for (const [id, acc] of bySubject) if (!subjectNames.has(id)) subjectNames.set(id, acc.name);

    for (const [subjectId, name] of subjectNames) {
      const acc = bySubject.get(subjectId);
      if (!acc) {
        // No scores recorded yet — show the subject with blanks.
        results.push({
          subjectId, subject: name,
          sbaRaw: 0, sbaTotal: 0, sbaPercent: null,
          examRaw: 0, examTotal: 0, examPercent: null,
          sbaScore: 0, examScore: 0, total: null, gradeLabel: null, remark: null,
        });
        continue;
      }
      // SBA percent = weighted average of each contributing category's percent.
      // Default (no config): every present category weighted equally. With
      // config: only categories that have a weight contribute.
      let sbaWeightedSum = 0;
      let sbaWeightTotal = 0;
      let sbaRaw = 0;
      let sbaTotal = 0;
      for (const [cat, agg] of acc.sbaByCat) {
        if (agg.total <= 0) continue;
        const w = hasConfiguredWeights ? (categoryWeights.get(cat) ?? 0) : 1;
        if (w <= 0) continue;
        const catPercent = (agg.raw / agg.total) * 100;
        sbaWeightedSum += catPercent * w;
        sbaWeightTotal += w;
        sbaRaw += agg.raw;
        sbaTotal += agg.total;
      }
      const sbaPercent = sbaWeightTotal > 0 ? sbaWeightedSum / sbaWeightTotal : null;
      const examPercent = acc.exam.total > 0 ? (acc.exam.raw / acc.exam.total) * 100 : null;

      // Combine. If a subject only has one side recorded so far, use it at full
      // weight so mid-term reports aren't dragged down by a missing exam.
      let total: number | null = null;
      let sbaScore = 0;
      let examScore = 0;
      if (sbaPercent !== null && examPercent !== null) {
        sbaScore = (sbaPercent * sbaWeight) / 100;
        examScore = (examPercent * examWeight) / 100;
        total = sbaScore + examScore;
      } else if (sbaPercent !== null) {
        sbaScore = sbaPercent;
        total = sbaPercent;
      } else if (examPercent !== null) {
        examScore = examPercent;
        total = examPercent;
      }

      const band = total !== null ? await this.grading.deriveBand(schoolId, Math.round(total), gradeLevelId) : null;

      results.push({
        subjectId,
        subject: name,
        sbaRaw: this.round(sbaRaw),
        sbaTotal: this.round(sbaTotal),
        sbaPercent: sbaPercent !== null ? this.round(sbaPercent) : null,
        examRaw: this.round(acc.exam.raw),
        examTotal: this.round(acc.exam.total),
        examPercent: examPercent !== null ? this.round(examPercent) : null,
        sbaScore: this.round(sbaScore),
        examScore: this.round(examScore),
        total: total !== null ? this.round(total) : null,
        gradeLabel: band?.label ?? null,
        remark: band?.remark ?? null,
      });
    }

    results.sort((a, b) => a.subject.localeCompare(b.subject));
    return results;
  }

  private async loadWeights(schoolId: string) {
    const config = await this.prisma.reportCardConfig.findUnique({ where: { schoolId } });
    const sbaWeight = config ? Number(config.sbaWeight) : 50;
    const examWeight = config ? Number(config.examWeight) : 50;
    const rows = await this.prisma.assessmentCategoryWeight.findMany({ where: { schoolId } });
    const categoryWeights = new Map<AssessmentCategory, number>(rows.map((r) => [r.category, Number(r.weight)]));
    return { sbaWeight, examWeight, categoryWeights };
  }

  // ── Generate (compile + persist snapshot for a whole class) ──

  async generate(schoolId: string, dto: GenerateReportCardsDto) {
    const term = await this.prisma.term.findFirst({
      where: { id: dto.termId, schoolId },
      include: { academicYear: { select: { id: true, name: true } } },
    });
    if (!term) throw new NotFoundException('Term not found');

    const cls = await this.prisma.class.findFirst({ where: { id: dto.classId, schoolId } });
    if (!cls) throw new NotFoundException('Class not found');

    const { sbaWeight, examWeight, categoryWeights } = await this.loadWeights(schoolId);

    const assignments = await this.prisma.studentClassAssignment.findMany({
      where: { classId: dto.classId, academicYearId: term.academicYearId },
      include: { student: { select: { id: true, studentId: true, firstName: true, lastName: true } } },
    });

    // First pass: compute every student's subjects + aggregate.
    const computed = await Promise.all(
      assignments.map(async ({ student }) => {
        const subjects = await this.computeSubjects(
          schoolId, student.id, dto.termId, cls.gradeLevelId, categoryWeights, sbaWeight, examWeight,
        );
        const aggregate = this.aggregateOf(subjects);
        return { studentId: student.id, subjects, aggregate };
      }),
    );

    // Rank by aggregate (desc); ties share a position.
    const ranked = [...computed].sort((a, b) => b.aggregate - a.aggregate);
    const positionByStudent = new Map<string, number>();
    ranked.forEach((c, i) => {
      if (i > 0 && c.aggregate === ranked[i - 1].aggregate) {
        positionByStudent.set(c.studentId, positionByStudent.get(ranked[i - 1].studentId)!);
      } else {
        positionByStudent.set(c.studentId, i + 1);
      }
    });
    const classSize = computed.length;

    for (const c of computed) {
      const overallGrade = await this.grading.deriveGrade(schoolId, Math.round(c.aggregate), cls.gradeLevelId);
      await this.prisma.reportCard.upsert({
        where: { studentId_termId: { studentId: c.studentId, termId: dto.termId } },
        update: {
          data: { subjects: c.subjects, overallGrade } as unknown as Prisma.InputJsonValue,
          aggregate: c.aggregate,
          position: positionByStudent.get(c.studentId) ?? null,
          classSize,
        },
        create: {
          studentId: c.studentId,
          termId: dto.termId,
          data: { subjects: c.subjects, overallGrade } as unknown as Prisma.InputJsonValue,
          aggregate: c.aggregate,
          position: positionByStudent.get(c.studentId) ?? null,
          classSize,
        },
      });
    }

    return { generated: computed.length, termId: dto.termId, classId: dto.classId };
  }

  async findForClass(schoolId: string, classId: string, termId: string) {
    const term = await this.prisma.term.findFirst({ where: { id: termId, schoolId } });
    if (!term) throw new NotFoundException('Term not found');

    const assignments = await this.prisma.studentClassAssignment.findMany({
      where: { classId, academicYearId: term.academicYearId },
      include: {
        student: {
          select: {
            id: true, studentId: true, firstName: true, lastName: true,
            reportCards: { where: { termId } },
          },
        },
      },
      orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
    });

    // Return every student in the class with their report-card status, so the UI
    // can list (and preview) all of them — generated or not.
    return assignments.map(({ student }) => {
      const rc = student.reportCards[0] ?? null;
      const status = !rc ? 'NOT_GENERATED' : rc.publishedAt ? 'PUBLISHED' : 'DRAFT';
      return {
        id: rc?.id ?? null,
        studentId: student.id,
        student: { firstName: student.firstName, lastName: student.lastName, studentId: student.studentId },
        termId,
        status,
        publishedAt: rc?.publishedAt ?? null,
        generatedAt: rc?.createdAt ?? null,
        aggregate: rc?.aggregate != null ? Number(rc.aggregate) : null,
        position: rc?.position ?? null,
        classSize: rc?.classSize ?? null,
      };
    });
  }

  async getStudentReportCard(schoolId: string, studentId: string, termId: string) {
    const student = await this.prisma.student.findFirst({ where: { id: studentId, schoolId } });
    if (!student) throw new NotFoundException('Student not found');

    const term = await this.prisma.term.findFirst({
      where: { id: termId, schoolId },
      include: { academicYear: { select: { id: true, name: true } } },
    });
    if (!term) throw new NotFoundException('Term not found');

    const config = await this.prisma.reportCardConfig.findUnique({
      where: { schoolId },
      include: { customSections: { orderBy: { position: 'asc' } } },
    });

    // Resolve the student's grade level for this academic year (for grading scale).
    const assignment = await this.prisma.studentClassAssignment.findFirst({
      where: { studentId, academicYearId: term.academicYearId },
      include: { class: { select: { gradeLevelId: true, name: true } } },
    });
    const gradeLevelId = assignment?.class.gradeLevelId;

    const reportCard = await this.prisma.reportCard.findUnique({
      where: { studentId_termId: { studentId, termId } },
    });

    // Prefer the persisted snapshot (stable once generated); otherwise compute
    // a live preview so unsaved scores are still visible.
    let subjects: SubjectResult[];
    let overallGrade: string | null;
    if (reportCard?.data) {
      const data = reportCard.data as unknown as { subjects: SubjectResult[]; overallGrade: string | null };
      subjects = data.subjects ?? [];
      overallGrade = data.overallGrade ?? null;
    } else {
      const { sbaWeight, examWeight, categoryWeights } = await this.loadWeights(schoolId);
      subjects = await this.computeSubjects(schoolId, studentId, termId, gradeLevelId, categoryWeights, sbaWeight, examWeight);
      overallGrade = await this.grading.deriveGrade(schoolId, Math.round(this.aggregateOf(subjects)), gradeLevelId);
    }

    const aggregate = reportCard?.aggregate != null
      ? Number(reportCard.aggregate)
      : this.aggregateOf(subjects);

    const attendance = await this.prisma.studentAttendanceRecord.findMany({
      where: { schoolId, studentId, ...(term.startDate && term.endDate ? { date: { gte: term.startDate, lte: term.endDate } } : {}) },
    });
    const totalDays = attendance.length;
    const presentDays = attendance.filter((a) => a.status === 'PRESENT' || a.status === 'LATE').length;

    // Assessment scale (Holistic Development) — configured rows or defaults.
    const [levelRows, skillRows] = await Promise.all([
      this.prisma.holisticProficiencyLevel.findMany({ where: { schoolId }, orderBy: { sequence: 'asc' } }),
      this.prisma.holisticSkill.findMany({ where: { schoolId }, orderBy: { sequence: 'asc' } }),
    ]);
    const assessmentScale = {
      levels: levelRows.length > 0 ? levelRows : DEFAULT_LEVELS.map((l) => ({ id: l.code, ...l })),
      skills: skillRows.length > 0 ? skillRows : DEFAULT_SKILLS.map((s, i) => ({ id: `default-${i}`, ...s })),
    };

    // Metrics table = the active grading scale bands for this student's level.
    const scale = await this.grading.getActiveScale(schoolId, gradeLevelId);
    const gradingBands = (scale?.bands ?? []).map((b) => ({
      label: b.label, minScore: Number(b.minScore), maxScore: Number(b.maxScore), remark: b.remark,
    }));

    // Holistic header extras: class teacher + when the next term reopens.
    let classTeacherName: string | null = null;
    if (assignment?.classId) {
      const tca = await this.prisma.teacherClassAssignment.findFirst({
        where: { classId: assignment.classId },
        include: { staffProfile: { include: { user: { select: { firstName: true, lastName: true } } } } },
      });
      if (tca) classTeacherName = `${tca.staffProfile.user.firstName} ${tca.staffProfile.user.lastName}`.trim();
    }
    const nextTerm = await this.prisma.term.findFirst({
      where: { academicYearId: term.academicYearId, sequence: { gt: term.sequence } },
      orderBy: { sequence: 'asc' },
      select: { startDate: true },
    });

    return {
      student: { id: student.id, studentId: student.studentId, firstName: student.firstName, lastName: student.lastName },
      term: { id: term.id, name: term.name, academicYear: term.academicYear },
      className: assignment?.class.name ?? null,
      classTeacherName,
      vacationDate: term.endDate ?? null,
      nextTermReopens: nextTerm?.startDate ?? null,
      config,
      subjects,
      overallGrade,
      aggregate,
      assessmentScale,
      gradingBands,
      holistic: (reportCard?.holistic as Record<string, string> | null) ?? null,
      position: reportCard?.position ?? null,
      classSize: reportCard?.classSize ?? null,
      conduct: reportCard
        ? {
            attitudes: reportCard.attitudes,
            interests: reportCard.interests,
            conduct: reportCard.conduct,
            teacherRemarks: reportCard.teacherRemarks,
            headTeacherRemarks: reportCard.headTeacherRemarks,
            promotedTo: reportCard.promotedTo,
          }
        : null,
      publishedAt: reportCard?.publishedAt ?? null,
      attendance: { totalDays, presentDays, absentDays: totalDays - presentDays, rate: totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0 },
    };
  }

  // Update the conduct / remarks / holistic ratings of a report card.
  async updateReportCard(schoolId: string, studentId: string, termId: string, dto: UpdateReportCardDto) {
    const student = await this.prisma.student.findFirst({ where: { id: studentId, schoolId } });
    if (!student) throw new NotFoundException('Student not found');

    const { holistic, ...rest } = dto;
    const data = {
      ...rest,
      ...(holistic !== undefined ? { holistic: holistic as Prisma.InputJsonValue } : {}),
    };

    return this.prisma.reportCard.upsert({
      where: { studentId_termId: { studentId, termId } },
      update: data,
      create: { studentId, termId, ...data },
    });
  }

  async publish(schoolId: string, dto: PublishReportCardsDto, actorId: string) {
    const term = await this.prisma.term.findFirst({ where: { id: dto.termId, schoolId } });
    if (!term) throw new NotFoundException('Term not found');

    const assignments = await this.prisma.studentClassAssignment.findMany({
      where: {
        classId: dto.classId,
        academicYearId: term.academicYearId,
        ...(dto.studentIds ? { studentId: { in: dto.studentIds } } : {}),
      },
      include: { student: { select: { id: true, firstName: true, lastName: true } } },
    });

    let published = 0;
    for (const { student } of assignments) {
      await this.prisma.reportCard.upsert({
        where: { studentId_termId: { studentId: student.id, termId: dto.termId } },
        update: { publishedAt: new Date() },
        create: { studentId: student.id, termId: dto.termId, publishedAt: new Date() },
      });

      // Notify via student portal
      await this.notifications.emitToPortalUser(schoolId, student.id, {
        eventType: 'report_card.published',
        title: 'Report Card Available',
        body: `${student.firstName}'s report card for ${term.name} is now available.`,
      });

      published++;
    }

    return { published, termId: dto.termId, classId: dto.classId };
  }
}
