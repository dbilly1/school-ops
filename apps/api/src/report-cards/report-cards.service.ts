import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GradingService } from '../school-setup/grading/grading.service';
import { NotificationsService } from '../notifications/notifications.service';
import { GenerateReportCardsDto, PublishReportCardsDto } from './dto/report-card.dto';

@Injectable()
export class ReportCardsService {
  constructor(
    private prisma: PrismaService,
    private grading: GradingService,
    private notifications: NotificationsService,
  ) {}

  // Compile and store report card data for all students in a class for a term
  async generate(schoolId: string, dto: GenerateReportCardsDto) {
    const term = await this.prisma.term.findFirst({
      where: { id: dto.termId, schoolId },
      include: { academicYear: { select: { id: true, name: true } } },
    });
    if (!term) throw new NotFoundException('Term not found');

    const config = await this.prisma.reportCardConfig.findUnique({
      where: { schoolId },
      include: { customSections: { orderBy: { position: 'asc' } } },
    });

    const gradingScale = await this.grading.getActiveScale(schoolId);

    const assignments = await this.prisma.studentClassAssignment.findMany({
      where: { classId: dto.classId, academicYearId: term.academicYearId },
      include: {
        student: { select: { id: true, studentId: true, firstName: true, lastName: true } },
      },
    });

    const generated: string[] = [];

    for (const { student } of assignments) {
      // Scores for this term
      const scores = await this.prisma.assessmentScore.findMany({
        where: {
          studentId: student.id,
          assessment: { schoolId, termId: dto.termId },
        },
        include: {
          assessment: {
            include: { subject: { select: { id: true, name: true } } },
          },
        },
      });

      // Attendance summary
      const attendance = await this.prisma.studentAttendanceRecord.findMany({
        where: {
          schoolId, studentId: student.id,
          ...(term.startDate && term.endDate ? { date: { gte: term.startDate, lte: term.endDate } } : {}),
        },
      });
      const totalDays = attendance.length;
      const presentDays = attendance.filter((a) => a.status === 'PRESENT' || a.status === 'LATE').length;

      // Group by subject and compute totals
      const subjectMap = new Map<string, { name: string; scores: typeof scores }>();
      for (const score of scores) {
        const subjectId = score.assessment.subjectId;
        if (!subjectMap.has(subjectId)) {
          subjectMap.set(subjectId, { name: score.assessment.subject.name, scores: [] });
        }
        subjectMap.get(subjectId)!.scores.push(score);
      }

      const subjects = await Promise.all(
        Array.from(subjectMap.entries()).map(async ([, { name, scores: subjectScores }]) => {
          const totalRaw = subjectScores.reduce((s, r) => s + Number(r.rawScore), 0);
          const totalPossible = subjectScores.reduce((s, r) => s + Number(r.assessment.totalScore), 0);
          const percentage = totalPossible > 0 ? Math.round((totalRaw / totalPossible) * 100) : 0;
          const gradeLabel = await this.grading.deriveGrade(schoolId, percentage);
          return { subject: name, totalRaw, totalPossible, percentage, gradeLabel };
        }),
      );

      // Upsert report card record
      await this.prisma.reportCard.upsert({
        where: { studentId_termId: { studentId: student.id, termId: dto.termId } },
        update: {}, // Data stored in a future PDF field; for now mark as generated
        create: { studentId: student.id, termId: dto.termId },
      });

      generated.push(student.id);
    }

    return {
      generated: generated.length,
      termId: dto.termId,
      classId: dto.classId,
    };
  }

  async findForClass(schoolId: string, classId: string, termId: string) {
    const term = await this.prisma.term.findFirst({ where: { id: termId, schoolId } });
    if (!term) throw new NotFoundException('Term not found');

    const assignments = await this.prisma.studentClassAssignment.findMany({
      where: { classId, academicYearId: term.academicYearId },
      include: {
        student: {
          select: { id: true, studentId: true, firstName: true, lastName: true },
          include: { reportCards: { where: { termId } } },
        },
      },
      orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
    });

    return assignments.map(({ student }) => ({
      student: { id: student.id, studentId: student.studentId, firstName: student.firstName, lastName: student.lastName },
      reportCard: student.reportCards[0] ?? null,
    }));
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

    const scores = await this.prisma.assessmentScore.findMany({
      where: { studentId, assessment: { schoolId, termId } },
      include: { assessment: { include: { subject: { select: { id: true, name: true } } } } },
    });

    const attendance = await this.prisma.studentAttendanceRecord.findMany({
      where: { schoolId, studentId, ...(term.startDate && term.endDate ? { date: { gte: term.startDate, lte: term.endDate } } : {}) },
    });

    const subjectMap = new Map<string, { name: string; scores: typeof scores }>();
    for (const score of scores) {
      const sid = score.assessment.subjectId;
      if (!subjectMap.has(sid)) subjectMap.set(sid, { name: score.assessment.subject.name, scores: [] });
      subjectMap.get(sid)!.scores.push(score);
    }

    const subjects = await Promise.all(
      Array.from(subjectMap.entries()).map(async ([, { name, scores: ss }]) => {
        const totalRaw = ss.reduce((s, r) => s + Number(r.rawScore), 0);
        const totalPossible = ss.reduce((s, r) => s + Number(r.assessment.totalScore), 0);
        const percentage = totalPossible > 0 ? Math.round((totalRaw / totalPossible) * 100) : 0;
        return { subject: name, totalRaw, totalPossible, percentage, gradeLabel: await this.grading.deriveGrade(schoolId, percentage) };
      }),
    );

    const totalDays = attendance.length;
    const presentDays = attendance.filter((a) => a.status === 'PRESENT' || a.status === 'LATE').length;

    return {
      student: { id: student.id, studentId: student.studentId, firstName: student.firstName, lastName: student.lastName },
      term: { id: term.id, name: term.name, academicYear: term.academicYear },
      config,
      subjects,
      attendance: { totalDays, presentDays, absentDays: totalDays - presentDays, rate: totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0 },
    };
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
