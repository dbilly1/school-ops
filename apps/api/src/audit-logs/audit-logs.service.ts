import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditAction } from '@prisma/client';

export interface AuditLogQuery {
  schoolId?: string;
  actorId?: string;
  action?: AuditAction;
  entityType?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class AuditLogsService {
  constructor(private prisma: PrismaService) {}

  async query(params: AuditLogQuery) {
    const page = params.page ?? 1;
    const limit = Math.min(params.limit ?? 50, 100);
    const skip = (page - 1) * limit;

    const where: any = {
      ...(params.schoolId ? { schoolId: params.schoolId } : {}),
      ...(params.actorId ? { actorId: params.actorId } : {}),
      ...(params.action ? { action: params.action } : {}),
      ...(params.entityType ? { entityType: params.entityType } : {}),
      ...((params.startDate || params.endDate) ? {
        createdAt: {
          ...(params.startDate ? { gte: new Date(params.startDate) } : {}),
          ...(params.endDate ? { lte: new Date(params.endDate) } : {}),
        },
      } : {}),
    };

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

    return {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      logs,
    };
  }

  async getSummary(schoolId: string) {
    const counts = await this.prisma.auditLog.groupBy({
      by: ['action'],
      where: { schoolId },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });

    const recentActors = await this.prisma.auditLog.findMany({
      where: { schoolId },
      select: {
        actorId: true,
        actor: { select: { firstName: true, lastName: true, email: true } },
        createdAt: true,
      },
      distinct: ['actorId'],
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayCount = await this.prisma.auditLog.count({
      where: { schoolId, createdAt: { gte: today } },
    });

    return {
      todayCount,
      byAction: counts.map((c) => ({ action: c.action, count: c._count.id })),
      recentActors,
    };
  }
}
