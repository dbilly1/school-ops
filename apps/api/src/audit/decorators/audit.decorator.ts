import { SetMetadata } from '@nestjs/common';
import { AuditAction } from '@prisma/client';

export const AUDIT_KEY = 'audit_log';

export interface AuditMeta {
  entityType: string;
  action: AuditAction;
  // If provided, the interceptor will extract the entity ID from response[idField]
  idField?: string;
}

export const Audit = (entityType: string, action: AuditAction, idField = 'id') =>
  SetMetadata(AUDIT_KEY, { entityType, action, idField });
