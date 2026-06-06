import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateSubscriptionDto, GrantFeatureDto } from './dto/manage-school.dto';

@Injectable()
export class SuperAdminSchoolsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.school.findMany({
      select: {
        id: true,
        name: true,
        country: true,
        subscriptionState: true,
        createdAt: true,
        package: { select: { id: true, name: true } },
        _count: { select: { users: true, students: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const school = await this.prisma.school.findUnique({
      where: { id },
      include: {
        package: true,
        schoolFeatures: true,
        schoolFeatureGrants: true,
        _count: { select: { users: true, students: true } },
      },
    });
    if (!school) throw new NotFoundException('School not found');
    return school;
  }

  async updateSubscription(id: string, dto: UpdateSubscriptionDto) {
    await this.findOne(id);
    return this.prisma.school.update({
      where: { id },
      data: { subscriptionState: dto.state },
      select: { id: true, subscriptionState: true },
    });
  }

  async assignPackage(schoolId: string, packageId: string) {
    await this.findOne(schoolId);
    const pkg = await this.prisma.package.findUnique({ where: { id: packageId } });
    if (!pkg) throw new NotFoundException('Package not found');

    return this.prisma.school.update({
      where: { id: schoolId },
      data: { packageId },
      select: { id: true, packageId: true },
    });
  }

  async grantFeature(schoolId: string, dto: GrantFeatureDto, grantedBy: string) {
    await this.findOne(schoolId);
    return this.prisma.schoolFeatureGrant.create({
      data: {
        schoolId,
        featureKey: dto.featureKey,
        subFeatureKey: dto.subFeatureKey ?? null,
        grantType: dto.grantType,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        grantedBy,
      },
    });
  }

  async revokeGrant(schoolId: string, grantId: string) {
    const grant = await this.prisma.schoolFeatureGrant.findFirst({
      where: { id: grantId, schoolId },
    });
    if (!grant) throw new NotFoundException('Grant not found');
    return this.prisma.schoolFeatureGrant.delete({ where: { id: grantId } });
  }
}
