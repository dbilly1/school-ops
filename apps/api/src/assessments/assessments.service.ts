import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GradingService } from '../school-setup/grading/grading.service';
import { TeacherScopeService } from '../staff/teacher-scope.service';
import { StaffRole, AssessmentCategory } from '@prisma/client';
import { CreateAssessmentDto, BatchCreateAssessmentDto, BulkRecordScoresDto } from './dto/assessment.dto';

type Caller = { id: string; roles: StaffRole[] };

@Injectable()
export class AssessmentsService {
  constructor(
    private prisma: PrismaService,
    private gradingService: GradingService,
    private teacherScope: TeacherScopeService,
  ) {}

  async findAll(schoolId: string, caller: Caller, termId?: string, subjectId?: string, classId?: string) {
    const scope = await this.teacherScope.assessmentScopeFilter(caller.id, caller.roles);
    return this.prisma.assessment.findMany({
      where: {
        schoolId,
        ...(termId ? { termId } : {}),
        ...(subjectId ? { subjectId } : {}),
        ...(classId ? { classId } : {}),
        ...(scope ?? {}),
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
    await this.teacherScope.assertCanManageAssessment(caller.id, caller.roles, dto.subjectId, dto.classId ?? null);

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

  // Fan one exam out across every (class × subject) combination, grouped into one
  // AssessmentBatch per class (e.g. "Primary 4 — End of Term Exam"). A combo is
  // created only when the subject belongs to that class's grade level and the
  // caller is allowed to manage it; non-applicable combos, forbidden combos, and
  // exact duplicates (same title/subject/class/term/category) are skipped so the
  // call is safe to re-run — re-runs reuse an existing batch and only add the
  // missing subjects.
  async batchCreate(schoolId: string, dto: BatchCreateAssessmentDto, caller: Caller) {
    if (!dto.classIds?.length) throw new BadRequestException('Select at least one class');
    if (!dto.subjects?.length) throw new BadRequestException('Select at least one subject');

    // Batch and its children share one concrete category (default end-of-term).
    const category = dto.category ?? AssessmentCategory.END_OF_TERM_EXAM;
    const assessmentDate = dto.assessmentDate ? new Date(dto.assessmentDate) : null;

    const term = await this.prisma.term.findFirst({ where: { id: dto.termId, schoolId } });
    if (!term) throw new NotFoundException('Term not found');

    const classes = await this.prisma.class.findMany({
      where: { id: { in: dto.classIds }, schoolId },
      select: { id: true, name: true, gradeLevelId: true },
    });
    if (classes.length === 0) throw new NotFoundException('No matching classes found');

    const subjectIds = [...new Set(dto.subjects.map((s) => s.subjectId))];
    const validSubjects = await this.prisma.subject.findMany({
      where: { id: { in: subjectIds }, schoolId },
      select: { id: true },
    });
    const validSubjectIds = new Set(validSubjects.map((s) => s.id));

    // Which subjects each grade level offers — drives the per-class applicability.
    const gradeLevelIds = [...new Set(classes.map((c) => c.gradeLevelId))];
    const gls = await this.prisma.gradeLevelSubject.findMany({
      where: { gradeLevelId: { in: gradeLevelIds } },
      select: { gradeLevelId: true, subjectId: true },
    });
    const subjectsByGradeLevel = new Map<string, Set<string>>();
    for (const g of gls) {
      if (!subjectsByGradeLevel.has(g.gradeLevelId)) subjectsByGradeLevel.set(g.gradeLevelId, new Set());
      subjectsByGradeLevel.get(g.gradeLevelId)!.add(g.subjectId);
    }

    // Existing assessments for this term that match the batch, so re-runs skip dupes.
    const existing = await this.prisma.assessment.findMany({
      where: {
        schoolId, termId: dto.termId, title: dto.title, category,
        classId: { in: dto.classIds }, subjectId: { in: subjectIds },
      },
      select: { classId: true, subjectId: true },
    });
    const existingKeys = new Set(existing.map((e) => `${e.classId}:${e.subjectId}`));

    // Existing batches for the same exam, so a re-run adds to them rather than
    // creating a second batch for the class.
    const existingBatches = await this.prisma.assessmentBatch.findMany({
      where: { schoolId, termId: dto.termId, title: dto.title, category, classId: { in: dto.classIds } },
      select: { id: true, classId: true },
    });
    const batchByClass = new Map(existingBatches.map((b) => [b.classId, b.id]));

    const skipped = { notOnGradeLevel: 0, duplicate: 0, forbidden: 0, unknownSubject: 0 };
    let createdBatches = 0;
    let createdAssessments = 0;

    for (const cls of classes) {
      const offered = subjectsByGradeLevel.get(cls.gradeLevelId) ?? new Set<string>();
      const rows: { subjectId: string; totalScore: number; weight: number | null }[] = [];

      for (const s of dto.subjects) {
        if (!validSubjectIds.has(s.subjectId)) { skipped.unknownSubject++; continue; }
        if (!offered.has(s.subjectId)) { skipped.notOnGradeLevel++; continue; }
        if (existingKeys.has(`${cls.id}:${s.subjectId}`)) { skipped.duplicate++; continue; }
        if (!(await this.teacherScope.canManageAssessment(caller.id, caller.roles, s.subjectId, cls.id))) {
          skipped.forbidden++; continue;
        }
        rows.push({ subjectId: s.subjectId, totalScore: s.totalScore, weight: s.weight ?? null });
      }

      if (rows.length === 0) continue;

      let batchId = batchByClass.get(cls.id);
      if (!batchId) {
        const batch = await this.prisma.assessmentBatch.create({
          data: { schoolId, classId: cls.id, termId: dto.termId, category, title: dto.title, assessmentDate },
        });
        batchId = batch.id;
        createdBatches++;
      }

      await this.prisma.assessment.createMany({
        data: rows.map((r) => ({
          schoolId, subjectId: r.subjectId, classId: cls.id, batchId,
          category, termId: dto.termId, title: dto.title,
          totalScore: r.totalScore, weight: r.weight, assessmentDate,
        })),
      });
      createdAssessments += rows.length;
    }

    return { batches: createdBatches, created: createdAssessments, skipped };
  }

  // List of exam batches (one row per class) with score-entry progress, scoped to
  // a restricted teacher's accessible classes.
  async findBatches(schoolId: string, caller: Caller, termId?: string, classId?: string) {
    const accessible = await this.teacherScope.accessibleClassIds(caller.id, caller.roles);
    const batches = await this.prisma.assessmentBatch.findMany({
      where: {
        schoolId,
        ...(termId ? { termId } : {}),
        ...(classId ? { classId } : {}),
        ...(accessible ? { classId: { in: accessible.length ? accessible : ['__none__'] } } : {}),
      },
      include: {
        class: { select: { id: true, name: true } },
        term: { select: { id: true, name: true } },
        assessments: { select: { id: true, _count: { select: { scores: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return batches.map((b) => ({
      id: b.id,
      title: b.title,
      category: b.category,
      assessmentDate: b.assessmentDate,
      class: b.class,
      term: b.term,
      subjectCount: b.assessments.length,
      subjectsScored: b.assessments.filter((a) => a._count.scores > 0).length,
    }));
  }

  // One batch with its per-subject assessments and score-entry status.
  async findBatch(schoolId: string, id: string, caller: Caller) {
    const batch = await this.prisma.assessmentBatch.findFirst({
      where: { id, schoolId },
      include: {
        class: { select: { id: true, name: true } },
        term: { select: { id: true, name: true } },
        assessments: {
          include: { subject: { select: { id: true, name: true } }, _count: { select: { scores: true } } },
          orderBy: { subject: { name: 'asc' } },
        },
      },
    });
    if (!batch) throw new NotFoundException('Assessment batch not found');

    const accessible = await this.teacherScope.accessibleClassIds(caller.id, caller.roles);
    if (accessible && !accessible.includes(batch.classId))
      throw new NotFoundException('Assessment batch not found');

    const studentCount = await this.prisma.studentClassAssignment.count({
      where: { classId: batch.classId, schoolId },
    });

    return {
      id: batch.id,
      title: batch.title,
      category: batch.category,
      assessmentDate: batch.assessmentDate,
      class: batch.class,
      term: batch.term,
      studentCount,
      assessments: batch.assessments.map((a) => ({
        id: a.id,
        title: a.title,
        totalScore: Number(a.totalScore),
        subject: a.subject,
        scored: a._count.scores,
      })),
    };
  }

  // Broadsheet for one exam batch: students × subjects, per-subject percentage +
  // grade, each student's average (normalised across subjects so a 50-mark and a
  // 100-mark paper count equally) and class position. Purely read/aggregate — the
  // terminal report card and its freeze/publish snapshot are untouched.
  async getBatchResults(schoolId: string, id: string, caller: Caller) {
    const batch = await this.prisma.assessmentBatch.findFirst({
      where: { id, schoolId },
      include: {
        class: { select: { id: true, name: true, gradeLevelId: true } },
        term: { select: { id: true, name: true } },
        assessments: {
          include: { subject: { select: { id: true, name: true } }, scores: true },
          orderBy: { subject: { name: 'asc' } },
        },
      },
    });
    if (!batch) throw new NotFoundException('Assessment batch not found');

    const accessible = await this.teacherScope.accessibleClassIds(caller.id, caller.roles);
    if (accessible && !accessible.includes(batch.classId))
      throw new NotFoundException('Assessment batch not found');

    const gradeLevelId = batch.class.gradeLevelId;

    // Subject columns, in display order.
    const subjects = batch.assessments.map((a) => ({
      assessmentId: a.id,
      subjectId: a.subject.id,
      name: a.subject.name,
      totalScore: Number(a.totalScore),
    }));

    // Class roster (per-class, as gradebook/attendance do).
    const roster = await this.prisma.studentClassAssignment.findMany({
      where: { classId: batch.classId, schoolId },
      include: { student: { select: { id: true, studentId: true, firstName: true, lastName: true } } },
      orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
    });

    // Quick lookup: assessmentId → (studentId → rawScore).
    const scoreMap = new Map<string, Map<string, number>>();
    for (const a of batch.assessments) {
      const m = new Map<string, number>();
      for (const s of a.scores) m.set(s.studentId, Number(s.rawScore));
      scoreMap.set(a.id, m);
    }

    // Build each student's row with per-subject percentages.
    const rows = await Promise.all(
      roster.map(async ({ student }) => {
        const cells = await Promise.all(
          batch.assessments.map(async (a) => {
            const total = Number(a.totalScore);
            const raw = scoreMap.get(a.id)!.get(student.id);
            const has = raw !== undefined;
            const percent = has && total > 0 ? (raw! / total) * 100 : null;
            return {
              assessmentId: a.id,
              subjectId: a.subject.id,
              rawScore: has ? raw! : null,
              totalScore: total,
              percent: percent !== null ? Math.round(percent) : null,
              grade: percent !== null ? await this.gradingService.deriveGrade(schoolId, Math.round(percent), gradeLevelId) : null,
            };
          }),
        );

        const recorded = cells.filter((c) => c.percent !== null);
        const totalRaw = cells.reduce((sum, c) => sum + (c.rawScore ?? 0), 0);
        const totalPossible = cells.reduce((sum, c) => sum + c.totalScore, 0);
        const average = recorded.length
          ? Math.round(recorded.reduce((sum, c) => sum + c.percent!, 0) / recorded.length)
          : null;

        return {
          student,
          cells,
          subjectsScored: recorded.length,
          totalRaw,
          totalPossible,
          average,
          overallGrade: average !== null ? await this.gradingService.deriveGrade(schoolId, average, gradeLevelId) : null,
          position: null as number | null,
        };
      }),
    );

    // Standard competition ranking by average (desc); students with no scores
    // stay unranked. Ties share a position, the next rank skips accordingly.
    const ranked = rows.filter((r) => r.average !== null).sort((a, b) => b.average! - a.average!);
    let lastAvg: number | null = null;
    let lastPos = 0;
    ranked.forEach((r, i) => {
      if (lastAvg === null || r.average! < lastAvg) { lastPos = i + 1; lastAvg = r.average!; }
      r.position = lastPos;
    });

    const classAverage = ranked.length
      ? Math.round(ranked.reduce((sum, r) => sum + r.average!, 0) / ranked.length)
      : null;

    return {
      id: batch.id,
      title: batch.title,
      category: batch.category,
      assessmentDate: batch.assessmentDate,
      class: { id: batch.class.id, name: batch.class.name },
      term: batch.term,
      subjects,
      students: rows,
      summary: {
        studentCount: rows.length,
        rankedCount: ranked.length,
        classAverage,
        subjectCount: subjects.length,
        fullyScored: subjects.length > 0 && batch.assessments.every((a) => a.scores.length > 0),
      },
    };
  }

  // Delete a whole batch — its assessments and their scores go with it.
  async deleteBatch(schoolId: string, id: string, caller: Caller) {
    const batch = await this.prisma.assessmentBatch.findFirst({
      where: { id, schoolId },
      include: { assessments: { select: { id: true } } },
    });
    if (!batch) throw new NotFoundException('Assessment batch not found');

    const accessible = await this.teacherScope.accessibleClassIds(caller.id, caller.roles);
    if (accessible && !accessible.includes(batch.classId))
      throw new NotFoundException('Assessment batch not found');

    const assessmentIds = batch.assessments.map((a) => a.id);
    await this.prisma.$transaction([
      this.prisma.assessmentScore.deleteMany({ where: { assessmentId: { in: assessmentIds } } }),
      this.prisma.assessment.deleteMany({ where: { id: { in: assessmentIds } } }),
      this.prisma.assessmentBatch.delete({ where: { id } }),
    ]);

    return { deleted: assessmentIds.length, batchId: id };
  }

  async delete(schoolId: string, id: string, caller: Caller) {
    const assessment = await this.prisma.assessment.findFirst({ where: { id, schoolId } });
    if (!assessment) throw new NotFoundException('Assessment not found');
    await this.teacherScope.assertCanManageAssessment(caller.id, caller.roles, assessment.subjectId, assessment.classId);

    // Scores have no cascade, so clear them first or the delete FK-throws.
    await this.prisma.$transaction([
      this.prisma.assessmentScore.deleteMany({ where: { assessmentId: id } }),
      this.prisma.assessment.delete({ where: { id } }),
    ]);

    // If this was the last subject in its batch, drop the now-empty batch row.
    let batchDeleted = false;
    if (assessment.batchId) {
      const remaining = await this.prisma.assessment.count({ where: { batchId: assessment.batchId } });
      if (remaining === 0) {
        await this.prisma.assessmentBatch.delete({ where: { id: assessment.batchId } });
        batchDeleted = true;
      }
    }

    return { deleted: id, batchId: assessment.batchId, batchDeleted };
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

  // Flat score list for a single assessment — used by the score-entry page to
  // pre-fill already-recorded marks. (findOne also returns scores, but the page
  // fetches this lean shape separately.)
  async getScores(schoolId: string, assessmentId: string) {
    const assessment = await this.prisma.assessment.findFirst({
      where: { id: assessmentId, schoolId },
      select: { id: true },
    });
    if (!assessment) throw new NotFoundException('Assessment not found');

    const scores = await this.prisma.assessmentScore.findMany({
      where: { assessmentId },
      select: { studentId: true, rawScore: true, remarks: true },
    });
    return scores.map((s) => ({
      studentId: s.studentId,
      rawScore: Number(s.rawScore),
      remarks: s.remarks,
    }));
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
    const cls = await this.prisma.class.findFirst({
      where: { id: classId, schoolId },
      select: { id: true, gradeLevelId: true },
    });
    if (!cls) throw new NotFoundException('Class not found');

    const students = await this.prisma.studentClassAssignment.findMany({
      where: { classId, schoolId },
      include: { student: { select: { id: true, studentId: true, firstName: true, lastName: true } } },
      orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
    });

    const assessments = await this.prisma.assessment.findMany({
      where: { schoolId, termId, classId },
      include: { scores: true, subject: { select: { name: true } } },
      // Group columns by subject so same-titled exams (e.g. "Mid-Term") are
      // distinguishable; date/created keep a stable order within a subject.
      orderBy: [{ subject: { name: 'asc' } }, { assessmentDate: 'asc' }, { createdAt: 'asc' }],
    });

    // Per-student row matching the grade-book UI: a column per assessment (raw
    // score + grade by the class's level scale), plus the term average + grade.
    return Promise.all(
      students.map(async ({ student }) => {
        const studentAssessments = await Promise.all(
          assessments.map(async (a) => {
            const score = a.scores.find((s) => s.studentId === student.id);
            const rawScore = score ? Number(score.rawScore) : null;
            const total = Number(a.totalScore);
            const pct = rawScore !== null && total > 0 ? (rawScore / total) * 100 : null;
            return {
              assessmentId: a.id,
              title: a.title,
              subject: a.subject.name,
              totalScore: total,
              rawScore,
              displayGrade: pct !== null ? await this.gradingService.deriveGrade(schoolId, Math.round(pct), cls.gradeLevelId) : null,
            };
          }),
        );

        const pcts = studentAssessments
          .filter((x) => x.rawScore !== null)
          .map((x) => (x.rawScore! / x.totalScore) * 100);
        const termAvg = pcts.length > 0 ? Math.round(pcts.reduce((s, p) => s + p, 0) / pcts.length) : null;

        return {
          student,
          assessments: studentAssessments,
          termAvg,
          displayGrade: termAvg !== null ? await this.gradingService.deriveGrade(schoolId, termAvg, cls.gradeLevelId) : null,
        };
      }),
    );
  }
}
