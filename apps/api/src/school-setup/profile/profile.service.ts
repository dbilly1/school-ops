import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateSchoolProfileDto } from './dto/update-profile.dto';
import { deriveSchoolPrefix } from '../../common/student-id';

@Injectable()
export class ProfileService {
  constructor(private prisma: PrismaService) {}

  async getProfile(schoolId: string) {
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: {
        id: true, name: true, country: true, address: true,
        phone: true, email: true, logoUrl: true, primaryColor: true,
        subscriptionState: true, createdAt: true,
        package: { select: { id: true, name: true } },
      },
    });
    if (!school) throw new NotFoundException('School not found');
    return school;
  }

  async updateProfile(schoolId: string, dto: UpdateSchoolProfileDto) {
    return this.prisma.school.update({
      where: { id: schoolId },
      data: dto,
      select: {
        id: true, name: true, country: true, address: true,
        phone: true, email: true, logoUrl: true, primaryColor: true,
      },
    });
  }

  async completeOnboarding(schoolId: string) {
    await this.prisma.school.update({
      where: { id: schoolId },
      data: { onboardingComplete: true },
    });
    return { onboardingComplete: true };
  }

  async getSettings(schoolId: string) {
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: { adminCanManagePermissions: true },
    });
    if (!school) throw new NotFoundException('School not found');
    return school;
  }

  async setAdminPermissionToggle(schoolId: string, allowed: boolean) {
    await this.prisma.school.update({
      where: { id: schoolId },
      data: { adminCanManagePermissions: allowed },
    });
    return { adminCanManagePermissions: allowed };
  }

  // ── Student ID prefix ─────────────────────────────────────
  // The prefix is the leading part of human-readable student IDs (e.g. "MIS"
  // in "MIS0042"). `suggested` is derived from the school name as a default.
  // `hasStudents` lets the UI warn that a change only affects future IDs —
  // changing it never renumbers existing students (those IDs are their logins).

  async getStudentIdConfig(schoolId: string) {
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: { name: true, studentIdPrefix: true },
    });
    if (!school) throw new NotFoundException('School not found');

    const hasStudents = (await this.prisma.student.count({ where: { schoolId } })) > 0;

    return {
      prefix: school.studentIdPrefix,
      suggested: deriveSchoolPrefix(school.name),
      hasStudents,
    };
  }

  async setStudentIdPrefix(schoolId: string, rawPrefix: string) {
    const prefix = rawPrefix.trim().toUpperCase();
    await this.prisma.school.update({
      where: { id: schoolId },
      data: { studentIdPrefix: prefix },
    });
    return { studentIdPrefix: prefix };
  }
}
