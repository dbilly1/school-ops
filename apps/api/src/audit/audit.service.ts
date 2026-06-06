import { Injectable } from '@nestjs/common';
import { AuditAction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditLogParams {
  schoolId?: string;
  actorId: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  beforeValue?: Record<string, any>;
  afterValue?: Record<string, any>;
  ipAddress?: string;
}

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(params: AuditLogParams): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        schoolId: params.schoolId ?? null,
        actorId: params.actorId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        beforeValue: params.beforeValue ?? undefined,
        afterValue: params.afterValue ?? undefined,
        ipAddress: params.ipAddress ?? null,
      },
    });
  }

  // Convenience: log a permission change with before/after
  async logPermissionChange(params: {
    schoolId: string;
    actorId: string;
    entityType: string;
    entityId: string;
    before: Record<string, any>;
    after: Record<string, any>;
    ipAddress?: string;
  }): Promise<void> {
    await this.log({
      ...params,
      action: AuditAction.PERMISSION_CHANGE,
      beforeValue: params.before,
      afterValue: params.after,
    });
  }
}
