import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, StaffRole } from '@prisma/client';

// Centralizes "which classes/subjects may this teacher act on" so attendance and
// assessments enforce the same rules:
//   • Class teacher (TeacherClassAssignment)  → attendance for that class AND
//     assessments for ALL subjects of that class.
//   • Subject teacher (TeacherSubjectAssignment) → assessments for the subject +
//     class they teach only; no attendance.
// All checks no-op for non-restricted users (Owner/Admin and any non-teacher
// role), so they keep full access.

@Injectable()
export class TeacherScopeService {
  constructor(private prisma: PrismaService) {}

  isRestricted(roles: StaffRole[]): boolean {
    return (
      roles.includes(StaffRole.TEACHER) &&
      !roles.includes(StaffRole.SCHOOL_OWNER) &&
      !roles.includes(StaffRole.SCHOOL_ADMIN) &&
      !roles.includes(StaffRole.HEADMASTER)
    );
  }

  // ── Student visibility: the classes whose students a restricted teacher may
  //    see — every class they class-teach or subject-teach. Used to scope the
  //    student roster/detail reads so a teacher can't browse the whole school.
  async studentScopeFilter(
    userId: string,
    roles: StaffRole[],
  ): Promise<Prisma.StudentWhereInput | null> {
    if (!this.isRestricted(roles)) return null;
    const staffProfileId = await this.staffProfileId(userId);
    if (!staffProfileId) return { id: '__none__' };

    const classTeacherIds = await this.classTeacherClassIds(staffProfileId);
    const subjectClassIds = (await this.subjectClassPairs(staffProfileId)).map((p) => p.classId);
    const classIds = [...new Set([...classTeacherIds, ...subjectClassIds])];
    if (classIds.length === 0) return { id: '__none__' };

    return { classAssignments: { some: { classId: { in: classIds } } } };
  }

  private async staffProfileId(userId: string): Promise<string | null> {
    const profile = await this.prisma.staffProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    return profile?.id ?? null;
  }

  private async classTeacherClassIds(staffProfileId: string): Promise<string[]> {
    const rows = await this.prisma.teacherClassAssignment.findMany({
      where: { staffProfileId },
      select: { classId: true },
    });
    return rows.map((r) => r.classId);
  }

  private async subjectClassPairs(staffProfileId: string): Promise<{ subjectId: string; classId: string }[]> {
    return this.prisma.teacherSubjectAssignment.findMany({
      where: { staffProfileId },
      select: { subjectId: true, classId: true },
    });
  }

  // ── Attendance: class teacher of that class only ──────────────────────────────
  async assertClassTeacher(userId: string, roles: StaffRole[], classId: string): Promise<void> {
    if (!this.isRestricted(roles)) return;
    const staffProfileId = await this.staffProfileId(userId);
    if (!staffProfileId) throw new ForbiddenException('You are not the class teacher of this class');
    const assignment = await this.prisma.teacherClassAssignment.findFirst({
      where: { staffProfileId, classId },
      select: { id: true },
    });
    if (!assignment) throw new ForbiddenException('You are not the class teacher of this class');
  }

  // ── Assessment create/delete: subject-teaches the subject IN that class, or
  //    class-teaches the class and the subject is on its grade level ────────────
  //    classId is optional for back-compat with class-less assessments, where it
  //    falls back to a subject-only / any-class-teacher check.
  async assertCanManageAssessment(
    userId: string,
    roles: StaffRole[],
    subjectId: string,
    classId?: string | null,
  ): Promise<void> {
    if (!this.isRestricted(roles)) return;
    const staffProfileId = await this.staffProfileId(userId);
    if (!staffProfileId) throw new ForbiddenException('You can only manage assessments for your assigned subjects and classes');

    // Subject teacher: must teach this subject — in this class when one is given.
    const teachesSubject = await this.prisma.teacherSubjectAssignment.findFirst({
      where: { staffProfileId, subjectId, ...(classId ? { classId } : {}) },
      select: { id: true },
    });
    if (teachesSubject) return;

    // Class teacher: must class-teach the target class (any of their classes when
    // none is given) and the subject must be on that class's grade level.
    const classIds = await this.classTeacherClassIds(staffProfileId);
    if (classIds.length > 0 && (!classId || classIds.includes(classId))) {
      const match = await this.prisma.class.findFirst({
        where: { id: classId ?? { in: classIds }, gradeLevel: { subjects: { some: { subjectId } } } },
        select: { id: true },
      });
      if (match) return;
    }
    throw new ForbiddenException('You can only manage assessments for your assigned subjects and classes');
  }

  // ── List visibility: the where-filter for assessments a restricted teacher may
  //    see (null = unrestricted). Class teacher sees everything for their class;
  //    subject teacher sees their subject in their classes; class-less legacy
  //    assessments fall back to recordable subjects. ─────────────────────────────
  async assessmentScopeFilter(userId: string, roles: StaffRole[]): Promise<Prisma.AssessmentWhereInput | null> {
    if (!this.isRestricted(roles)) return null;
    const staffProfileId = await this.staffProfileId(userId);
    if (!staffProfileId) return { id: '__none__' };

    const classTeacherIds = await this.classTeacherClassIds(staffProfileId);
    const pairs = await this.subjectClassPairs(staffProfileId);
    const recordable = await this.recordableSubjectIds(userId);

    const or: Prisma.AssessmentWhereInput[] = [];
    if (classTeacherIds.length > 0) or.push({ classId: { in: classTeacherIds } });
    for (const p of pairs) or.push({ subjectId: p.subjectId, classId: p.classId });
    if (recordable.length > 0) or.push({ classId: null, subjectId: { in: recordable } });

    return or.length > 0 ? { OR: or } : { id: '__none__' };
  }

  // ── Score recording: every scored student must be in a class the teacher
  //    class-teaches, or subject-teaches this subject in ─────────────────────────
  async assertCanRecordScores(
    userId: string,
    roles: StaffRole[],
    schoolId: string,
    subjectId: string,
    academicYearId: string,
    studentIds: string[],
  ): Promise<void> {
    if (!this.isRestricted(roles)) return;
    const staffProfileId = await this.staffProfileId(userId);
    if (!staffProfileId) throw new ForbiddenException('You can only record scores for your assigned class or subject');

    const classTeacherIds = new Set(await this.classTeacherClassIds(staffProfileId));
    const subjectClassIds = new Set(
      (await this.subjectClassPairs(staffProfileId))
        .filter((p) => p.subjectId === subjectId)
        .map((p) => p.classId),
    );

    const assignments = await this.prisma.studentClassAssignment.findMany({
      where: { studentId: { in: studentIds }, academicYearId, schoolId },
      select: { studentId: true, classId: true },
    });
    const classByStudent = new Map(assignments.map((a) => [a.studentId, a.classId]));

    for (const studentId of studentIds) {
      const classId = classByStudent.get(studentId);
      if (!classId || (!classTeacherIds.has(classId) && !subjectClassIds.has(classId))) {
        throw new ForbiddenException('You can only record scores for your assigned class or subject');
      }
    }
  }

  // ── For UI scoping: classes the user class-teaches ───────────────────────────
  async classTeacherClassIdsForUser(userId: string): Promise<string[]> {
    const staffProfileId = await this.staffProfileId(userId);
    if (!staffProfileId) return [];
    return this.classTeacherClassIds(staffProfileId);
  }

  // ── For UI scoping: subjects the user may record (subject-teacher subjects ∪
  //    all subjects of class-teacher classes) ───────────────────────────────────
  async recordableSubjectIds(userId: string): Promise<string[]> {
    const staffProfileId = await this.staffProfileId(userId);
    if (!staffProfileId) return [];

    const subjectIds = new Set<string>();
    (await this.subjectClassPairs(staffProfileId)).forEach((p) => subjectIds.add(p.subjectId));

    const classIds = await this.classTeacherClassIds(staffProfileId);
    if (classIds.length > 0) {
      const gradeLevelSubjects = await this.prisma.gradeLevelSubject.findMany({
        where: { gradeLevel: { classes: { some: { id: { in: classIds } } } } },
        select: { subjectId: true },
      });
      gradeLevelSubjects.forEach((g) => subjectIds.add(g.subjectId));
    }
    return [...subjectIds];
  }
}
