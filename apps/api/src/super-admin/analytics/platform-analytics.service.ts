import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PlatformAnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getDashboard() {
    const [
      totalSchools,
      activeSchools,
      trialSchools,
      suspendedSchools,
      totalStudents,
      totalUsers,
      packageDistribution,
      recentSignups,
    ] = await Promise.all([
      this.prisma.school.count(),
      this.prisma.school.count({ where: { subscriptionState: 'ACTIVE' } }),
      this.prisma.school.count({ where: { subscriptionState: 'TRIAL' } }),
      this.prisma.school.count({ where: { subscriptionState: 'SUSPENDED' } }),
      this.prisma.student.count(),
      this.prisma.user.count(),
      this.prisma.school.groupBy({
        by: ['packageId'],
        _count: { id: true },
      }),
      this.prisma.school.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true, name: true, country: true,
          subscriptionState: true, createdAt: true,
          package: { select: { id: true, name: true } },
          _count: { select: { users: true, students: true } },
        },
      }),
    ]);

    // Resolve package names
    const packageIds = packageDistribution.map((p) => p.packageId).filter(Boolean) as string[];
    const packages = await this.prisma.package.findMany({
      where: { id: { in: packageIds } },
      select: { id: true, name: true },
    });
    const pkgMap = new Map(packages.map((p) => [p.id, p.name]));

    return {
      schools: {
        total: totalSchools,
        active: activeSchools,
        trial: trialSchools,
        suspended: suspendedSchools,
        expired: totalSchools - activeSchools - trialSchools - suspendedSchools,
      },
      totalStudents,
      totalStaffUsers: totalUsers,
      packageDistribution: packageDistribution.map((p) => ({
        packageId: p.packageId,
        packageName: p.packageId ? pkgMap.get(p.packageId) ?? 'Unknown' : 'No Package',
        count: p._count.id,
      })),
      recentSignups,
    };
  }

  async getSchoolAuditLogs(schoolId?: string, page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const where = schoolId ? { schoolId } : {};

    const [total, logs] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        include: {
          actor: { select: { id: true, firstName: true, lastName: true, email: true } },
          school: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return { total, page, limit, pages: Math.ceil(total / limit), logs };
  }
}
