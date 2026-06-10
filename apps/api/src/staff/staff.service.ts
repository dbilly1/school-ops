import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TeacherScopeService } from './teacher-scope.service';
import { UpdateStaffProfileDto, AssignClassDto, AssignSubjectDto } from './dto/staff.dto';

@Injectable()
export class StaffService {
  constructor(
    private prisma: PrismaService,
    private teacherScope: TeacherScopeService,
  ) {}

  async getProfile(schoolId: string, userId: string) {
    const profile = await this.prisma.staffProfile.findFirst({
      where: { schoolId, userId },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true, roles: true } },
        qualifications: true,
        classAssignments: {
          include: { class: { include: { gradeLevel: { select: { id: true, name: true } } } } },
        },
        subjectAssignments: {
          include: {
            subject: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!profile) throw new NotFoundException('Staff profile not found');

    // Resolve class names for subject assignments (no Prisma relation on that model)
    const classIds = [...new Set(profile.subjectAssignments.map(sa => sa.classId))];
    const classes  = classIds.length
      ? await this.prisma.class.findMany({
          where:  { id: { in: classIds } },
          select: { id: true, name: true },
        })
      : [];
    const classMap = new Map(classes.map(c => [c.id, c]));

    return {
      ...profile,
      subjectAssignments: profile.subjectAssignments.map(sa => ({
        ...sa,
        class: classMap.get(sa.classId) ?? { id: sa.classId, name: 'Unknown' },
      })),
    };
  }

  async updateProfile(schoolId: string, userId: string, dto: UpdateStaffProfileDto) {
    const profile = await this.prisma.staffProfile.findFirst({
      where: { schoolId, userId },
    });
    if (!profile) throw new NotFoundException('Staff profile not found');

    const { qualifications, ...profileData } = dto;

    return this.prisma.$transaction(async (tx) => {
      if (qualifications !== undefined) {
        await tx.staffQualification.deleteMany({ where: { staffProfileId: profile.id } });
      }

      return tx.staffProfile.update({
        where: { id: profile.id },
        data: {
          ...profileData,
          dateJoined: profileData.dateJoined ? new Date(profileData.dateJoined) : undefined,
          dateOfBirth: profileData.dateOfBirth ? new Date(profileData.dateOfBirth) : undefined,
          ...(qualifications ? { qualifications: { create: qualifications } } : {}),
        },
        include: { qualifications: true },
      });
    });
  }

  async assignClass(schoolId: string, userId: string, dto: AssignClassDto) {
    const profile = await this.prisma.staffProfile.findFirst({ where: { schoolId, userId } });
    if (!profile) throw new NotFoundException('Staff profile not found');

    const cls = await this.prisma.class.findFirst({ where: { id: dto.classId, schoolId } });
    if (!cls) throw new NotFoundException('Class not found');

    const existing = await this.prisma.teacherClassAssignment.findFirst({
      where: { staffProfileId: profile.id, classId: dto.classId },
    });
    if (existing) throw new ConflictException('Teacher already assigned to this class');

    return this.prisma.teacherClassAssignment.create({
      data: { staffProfileId: profile.id, classId: dto.classId },
      include: { class: { include: { gradeLevel: { select: { id: true, name: true } } } } },
    });
  }

  async removeClassAssignment(schoolId: string, userId: string, classId: string) {
    const profile = await this.prisma.staffProfile.findFirst({ where: { schoolId, userId } });
    if (!profile) throw new NotFoundException('Staff profile not found');

    const assignment = await this.prisma.teacherClassAssignment.findFirst({
      where: { staffProfileId: profile.id, classId },
    });
    if (!assignment) throw new NotFoundException('Class assignment not found');

    return this.prisma.teacherClassAssignment.delete({ where: { id: assignment.id } });
  }

  async assignSubject(schoolId: string, userId: string, dto: AssignSubjectDto) {
    const profile = await this.prisma.staffProfile.findFirst({ where: { schoolId, userId } });
    if (!profile) throw new NotFoundException('Staff profile not found');

    const subject = await this.prisma.subject.findFirst({ where: { id: dto.subjectId, schoolId } });
    if (!subject) throw new NotFoundException('Subject not found');

    const cls = await this.prisma.class.findFirst({ where: { id: dto.classId, schoolId } });
    if (!cls) throw new NotFoundException('Class not found');

    const existing = await this.prisma.teacherSubjectAssignment.findFirst({
      where: { staffProfileId: profile.id, subjectId: dto.subjectId, classId: dto.classId },
    });
    if (existing) throw new ConflictException('Teacher already assigned to this subject in this class');

    return this.prisma.teacherSubjectAssignment.create({
      data: { staffProfileId: profile.id, subjectId: dto.subjectId, classId: dto.classId },
      include: { subject: { select: { id: true, name: true } } },
    });
  }

  async removeSubjectAssignment(schoolId: string, userId: string, assignmentId: string) {
    const profile = await this.prisma.staffProfile.findFirst({ where: { schoolId, userId } });
    if (!profile) throw new NotFoundException('Staff profile not found');

    const assignment = await this.prisma.teacherSubjectAssignment.findFirst({
      where: { id: assignmentId, staffProfileId: profile.id },
    });
    if (!assignment) throw new NotFoundException('Subject assignment not found');

    return this.prisma.teacherSubjectAssignment.delete({ where: { id: assignmentId } });
  }

  async getMyAssignments(schoolId: string, userId: string) {
    const profile = await this.prisma.staffProfile.findFirst({
      where: { schoolId, userId },
      include: {
        classAssignments: {
          include: { class: { select: { id: true, name: true } } },
        },
        subjectAssignments: {
          include: { subject: { select: { id: true, name: true } } },
        },
      },
    });

    if (!profile) return { classAssignments: [], subjectAssignments: [] };

    // Resolve class names for subject assignments (no Prisma relation on that model)
    const classIds = [...new Set(profile.subjectAssignments.map(sa => sa.classId))];
    const classes  = classIds.length
      ? await this.prisma.class.findMany({
          where:  { id: { in: classIds } },
          select: { id: true, name: true },
        })
      : [];
    const classMap = new Map(classes.map(c => [c.id, c]));

    const recordableSubjectIds = await this.teacherScope.recordableSubjectIds(userId);

    return {
      classAssignments: profile.classAssignments,
      subjectAssignments: profile.subjectAssignments.map(sa => ({
        ...sa,
        class: classMap.get(sa.classId) ?? { id: sa.classId, name: 'Unknown' },
      })),
      // Classes the user is the class teacher of (attendance scope).
      classTeacherClassIds: profile.classAssignments.map(a => a.classId),
      // Subjects the user may record assessments for (subject-teacher subjects ∪
      // every subject of their class-teacher classes).
      recordableSubjectIds,
    };
  }

  async findTeachersForSubject(schoolId: string, subjectId: string) {
    return this.prisma.staffProfile.findMany({
      where: {
        schoolId,
        subjectAssignments: { some: { subjectId } },
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
        subjectAssignments: {
          where: { subjectId },
          include: { subject: { select: { id: true, name: true } } },
        },
      },
    });
  }
}
