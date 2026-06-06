import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateSchoolProfileDto } from './dto/update-profile.dto';

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
}
