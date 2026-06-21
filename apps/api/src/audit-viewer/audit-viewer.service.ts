import { Injectable } from '@nestjs/common';
import { Prisma, AuditAction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface AuditQuery {
  actorId?: string;
  action?: AuditAction;
  entityType?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class AuditViewerService {
  constructor(private prisma: PrismaService) {}

  // School-scoped viewer (School Owner / Admin)
  async queryForSchool(schoolId: string, query: AuditQuery) {
    return this.runQuery({ schoolId }, query);
  }

  // Platform-wide viewer (Super Admin)
  async queryAllTenants(query: AuditQuery) {
    return this.runQuery({}, query);
  }

  // Headline stats for the school audit dashboard.
  async summaryForSchool(schoolId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [total, todayCount, byAction, recentActors] = await Promise.all([
      this.prisma.auditLog.count({ where: { schoolId } }),
      this.prisma.auditLog.count({ where: { schoolId, createdAt: { gte: today } } }),
      this.prisma.auditLog.groupBy({
        by: ['action'],
        where: { schoolId },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      }),
      this.prisma.auditLog.findMany({
        where: { schoolId },
        select: {
          actorId: true,
          createdAt: true,
          actor: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
        distinct: ['actorId'],
        orderBy: { createdAt: 'desc' },
        take: 6,
      }),
    ]);

    return {
      total,
      todayCount,
      byAction: byAction.map((a) => ({ action: a.action, count: a._count.id })),
      recentActors,
    };
  }

  private async runQuery(baseWhere: Prisma.AuditLogWhereInput, query: AuditQuery) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize = query.pageSize && query.pageSize > 0 ? Math.min(query.pageSize, 100) : 50;

    const where: Prisma.AuditLogWhereInput = {
      ...baseWhere,
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.startDate || query.endDate
        ? {
            createdAt: {
              ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
              ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
            },
          }
        : {}),
    };

    const [total, logs] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        include: {
          actor: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      logs,
    };
  }
}
