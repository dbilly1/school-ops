import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GradingService } from '../school-setup/grading/grading.service';
import { TeacherScopeService } from '../staff/teacher-scope.service';
import { StaffRole } from '@prisma/client';
import { CreateAssessmentDto, BulkRecordScoresDto } from './dto/assessment.dto';

type Caller = { id: string; roles: StaffRole[] };

@Injectable()
export class AssessmentsService {
  constructor(
    private prisma: PrismaService,
    private gradingService: GradingService,
    private teacherScope: TeacherScopeService,
  ) {}

  async findAll(schoolId: string, termId?: string, subjectId?: string, classId?: string) {
    return this.prisma.assessment.findMany({
      where: {
        schoolId,
        ...(termId ? { termId } : {}),
        ...(subjectId ? { subjectId } : {}),
        ...(classId ? { classId } : {}),
      },
      include: {
        subject: { select: { id: true, name: true } },
        class: { select: { id: true, name: true } },
        term: { select: { id: true, name: true } },
        _count: { select: { scores: true } },
      },
      orderBy: [{ assessmentDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(schoolId: string, id: string) {
    const assessment = await this.prisma.assessment.findFirst({
      where: { id, schoolId },
      include: {
        subject: { select: { id: true, name: true } },
        class: { select: { id: true, name: true } },
        term: { select: { id: true, name: true } },
        scores: {
          include: { student: { select: { id: true, studentId: true, firstName: true, lastName: true } } },
          orderBy: { rawScore: 'desc' },
        },
      },
    });
    if (!assessment) throw new NotFoundException('Assessment not found');

    // Attach derived grade labels
    const scoresWithGrades = await Promise.all(
      assessment.scores.map(async (s) => ({
        ...s,
        gradeLabel: await this.gradingService.deriveGrade(schoolId, Number(s.rawScore)),
      })),
    );

    return { ...assessment, scores: scoresWithGrades };
  }

  async create(schoolId: string, dto: CreateAssessmentDto, caller: Caller) {
    await this.teacherScope.assertCanManageAssessment(caller.id, caller.roles, dto.subjectId);

    const term = await this.prisma.term.findFirst({ where: { id: dto.termId, schoolId } });
    if (!term) throw new NotFoundException('Term not found');

    const subject = await this.prisma.subject.findFirst({ where: { id: dto.subjectId, schoolId } });
    if (!subject) throw new NotFoundException('Subject not found');

    if (dto.classId) {
      const cls = await this.prisma.class.findFirst({ where: { id: dto.classId, schoolId } });
      if (!cls) throw new NotFoundException('Class not found');
    }

    return this.prisma.assessment.create({
      data: {
        schoolId,
        subjectId: dto.subjectId,
        classId: dto.classId ?? null,
        category: dto.category,
        termId: dto.termId,
        title: dto.title,
        totalScore: dto.totalScore,
        weight: dto.weight,
        assessmentDate: dto.assessmentDate ? new Date(dto.assessmentDate) : null,
      },
      include: {
        subject: { select: { id: true, name: true } },
        class: { select: { id: true, name: true } },
        term: { select: { id: true, name: true } },
      },
    });
  }

  async delete(schoolId: string, id: string, caller: Caller) {
    const assessment = await this.prisma.assessment.findFirst({ where: { id, schoolId } });
    if (!assessment) throw new NotFoundException('Assessment not found');
    await this.teacherScope.assertCanManageAssessment(caller.id, caller.roles, assessment.subjectId);
    return this.prisma.assessment.delete({ where: { id } });
  }

  async recordScores(schoolId: string, assessmentId: string, dto: BulkRecordScoresDto, caller: Caller) {
    const assessment = await this.prisma.assessment.findFirst({
      where: { id: assessmentId, schoolId },
      include: { term: { select: { academicYearId: true } } },
    });
    if (!assessment) throw new NotFoundException('Assessment not found');

    const studentIds = [...new Set(dto.scores.map((s) => s.studentId))];
    const validStudents = await this.prisma.student.count({ where: { id: { in: studentIds }, schoolId } });
    if (validStudents !== studentIds.length) throw new NotFoundException('One or more students not found');

    await this.teacherScope.assertCanRecordScores(
      caller.id, caller.roles, schoolId, assessment.subjectId, assessment.term.academicYearId, studentIds,
    );

    // Scores must fall within 0..totalScore (M1) — otherwise percentages/grades break.
    const max = Number(assessment.totalScore);
    const invalid = dto.scores.find((s) => Number(s.rawScore) < 0 || Number(s.rawScore) > max);
    if (invalid)
      throw new BadRequestException(`Score ${invalid.rawScore} is out of range (0–${max}) for this assessment`);

    const results = await this.prisma.$transaction(
      dto.scores.map((s) =>
        this.prisma.assessmentScore.upsert({
          where: { assessmentId_studentId: { assessmentId, studentId: s.studentId } },
          update: { rawScore: s.rawScore, remarks: s.remarks },
          create: { assessmentId, studentId: s.studentId, rawScore: s.rawScore, remarks: s.remarks },
        }),
      ),
    );

    return { recorded: results.length, assessmentId };
  }

  async getScoresByStudent(schoolId: string, studentId: string, termId?: string) {
    const scores = await this.prisma.assessmentScore.findMany({
      where: {
        studentId,
        assessment: {
          schoolId,
          ...(termId ? { termId } : {}),
        },
      },
      include: {
        assessment: {
          include: {
            subject: { select: { id: true, name: true } },
            term: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { assessment: { assessmentDate: 'desc' } },
    });

    return Promise.all(
      scores.map(async (s) => ({
        ...s,
        gradeLabel: await this.gradingService.deriveGrade(schoolId, Number(s.rawScore)),
        percentage: Math.round((Number(s.rawScore) / Number(s.assessment.totalScore)) * 100),
      })),
    );
  }

  async getGradeBook(schoolId: string, classId: string, termId: string) {
    const cls = await this.prisma.class.findFirst({ where: { id: classId, schoolId } });
    if (!cls) throw new NotFoundException('Class not found');

    const students = await this.prisma.studentClassAssignment.findMany({
      where: { classId, schoolId },
      include: { student: { select: { id: true, studentId: true, firstName: true, lastName: true } } },
      orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
    });

    const assessments = await this.prisma.assessment.findMany({
      where: { schoolId, termId, classId },
      include: {
        subject: { select: { id: true, name: true } },
        scores: true,
      },
      orderBy: { assessmentDate: 'asc' },
    });

    const rows = students.map(({ student }) => {
      const scores = assessments.map((a) => {
        const score = a.scores.find((s) => s.studentId === student.id);
        return {
          assessmentId: a.id,
          title: a.title,
          category: a.category,
          subject: a.subject.name,
          totalScore: a.totalScore,
          rawScore: score?.rawScore ?? null,
          percentage: score ? Math.round((Number(score.rawScore) / Number(a.totalScore)) * 100) : null,
        };
      });
      return { student, scores };
    });

    return { assessments: assessments.map((a) => ({ id: a.id, title: a.title, category: a.category, subject: a.subject.name, totalScore: a.totalScore })), rows };
  }
}
