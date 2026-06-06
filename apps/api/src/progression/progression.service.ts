import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ExecuteProgressionDto, ProgressionAction } from './dto/progression.dto';

@Injectable()
export class ProgressionService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  // Preview what will happen — does not make any changes
  async preview(schoolId: string, fromYearId: string, toYearId: string) {
    const [fromYear, toYear] = await Promise.all([
      this.prisma.academicYear.findFirst({ where: { id: fromYearId, schoolId }, include: { terms: true } }),
      this.prisma.academicYear.findFirst({ where: { id: toYearId, schoolId } }),
    ]);
    if (!fromYear) throw new NotFoundException('Source academic year not found');
    if (!toYear) throw new NotFoundException('Target academic year not found');

    const assignments = await this.prisma.studentClassAssignment.findMany({
      where: { academicYearId: fromYearId, class: { schoolId } },
      include: {
        student: { select: { id: true, studentId: true, firstName: true, lastName: true } },
        class: {
          include: { gradeLevel: { select: { id: true, name: true, sequence: true } } },
        },
      },
    });

    const gradeLevels = await this.prisma.gradeLevel.findMany({
      where: { schoolId },
      orderBy: { sequence: 'asc' },
    });

    const toClasses = await this.prisma.class.findMany({
      where: { schoolId },
      include: { gradeLevel: { select: { id: true, name: true, sequence: true } } },
    });

    const preview = assignments.map(({ student, class: cls }) => {
      const nextSequence = cls.gradeLevel.sequence + 1;
      const nextGrade = gradeLevels.find((g) => g.sequence === nextSequence);
      const targetClass = toClasses.find((c) => c.gradeLevel.sequence === nextSequence);

      return {
        student,
        currentClass: { id: cls.id, name: cls.name, gradeLevel: cls.gradeLevel },
        defaultAction: nextGrade ? ProgressionAction.PROMOTE : 'GRADUATE',
        suggestedTargetClass: targetClass ?? null,
        isLastGrade: !nextGrade,
      };
    });

    return {
      fromYear: { id: fromYear.id, name: fromYear.name },
      toYear: { id: toYear.id, name: toYear.name },
      totalStudents: preview.length,
      preview,
    };
  }

  // Execute promotion — creates new class assignments for all students
  async execute(schoolId: string, dto: ExecuteProgressionDto, actorId: string) {
    const { fromAcademicYearId, toAcademicYearId, overrides = [] } = dto;

    const [fromYear, toYear] = await Promise.all([
      this.prisma.academicYear.findFirst({ where: { id: fromAcademicYearId, schoolId } }),
      this.prisma.academicYear.findFirst({ where: { id: toAcademicYearId, schoolId } }),
    ]);
    if (!fromYear) throw new NotFoundException('Source academic year not found');
    if (!toYear) throw new NotFoundException('Target academic year not found');

    const assignments = await this.prisma.studentClassAssignment.findMany({
      where: { academicYearId: fromAcademicYearId, class: { schoolId } },
      include: {
        class: {
          include: { gradeLevel: { select: { id: true, sequence: true } } },
        },
      },
    });

    const toClasses = await this.prisma.class.findMany({
      where: { schoolId },
      include: { gradeLevel: { select: { id: true, sequence: true } } },
    });

    const gradeLevels = await this.prisma.gradeLevel.findMany({
      where: { schoolId },
      orderBy: { sequence: 'asc' },
    });

    const overrideMap = new Map(overrides.map((o) => [o.studentId, o]));

    const newAssignments: { studentId: string; classId: string; academicYearId: string; schoolId: string }[] = [];
    const skipped: string[] = [];

    for (const assignment of assignments) {
      const override = overrideMap.get(assignment.studentId);
      const action = override?.action ?? ProgressionAction.PROMOTE;

      if (action === ProgressionAction.REPEAT) {
        // Stay in same grade level but in the new year's equivalent class
        const equivalentClass = toClasses.find(
          (c) => c.gradeLevel.sequence === assignment.class.gradeLevel.sequence,
        );
        if (equivalentClass) {
          newAssignments.push({
            studentId: assignment.studentId,
            classId: equivalentClass.id,
            academicYearId: toAcademicYearId,
            schoolId,
          });
        }
        continue;
      }

      if (action === ProgressionAction.SKIP) {
        const skipToSequence = assignment.class.gradeLevel.sequence + 2;
        const targetClass = override?.targetClassId
          ? toClasses.find((c) => c.id === override.targetClassId)
          : toClasses.find((c) => c.gradeLevel.sequence === skipToSequence);

        if (targetClass) {
          newAssignments.push({
            studentId: assignment.studentId,
            classId: targetClass.id,
            academicYearId: toAcademicYearId,
            schoolId,
          });
        }
        continue;
      }

      // Default: PROMOTE
      if (override?.targetClassId) {
        newAssignments.push({
          studentId: assignment.studentId,
          classId: override.targetClassId,
          academicYearId: toAcademicYearId,
          schoolId,
        });
        continue;
      }

      const nextSequence = assignment.class.gradeLevel.sequence + 1;
      const nextGrade = gradeLevels.find((g) => g.sequence === nextSequence);
      if (!nextGrade) {
        skipped.push(assignment.studentId); // Graduated
        continue;
      }

      const targetClass = toClasses.find((c) => c.gradeLevel.sequence === nextSequence);
      if (targetClass) {
        newAssignments.push({
          studentId: assignment.studentId,
          classId: targetClass.id,
          academicYearId: toAcademicYearId,
          schoolId,
        });
      }
    }

    // Create all new assignments
    await this.prisma.studentClassAssignment.createMany({
      data: newAssignments,
      skipDuplicates: true,
    });

    await this.audit.log({
      schoolId,
      actorId,
      action: 'PROGRESSION',
      entityType: 'academic_year',
      entityId: toAcademicYearId,
      afterValue: {
        fromYear: fromAcademicYearId,
        toYear: toAcademicYearId,
        promoted: newAssignments.length,
        skipped: skipped.length,
      },
    });

    return {
      promoted: newAssignments.length,
      graduated: skipped.length,
      toYear: { id: toYear.id, name: toYear.name },
    };
  }
}
