import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { AUDIT_KEY, AuditMeta } from './decorators/audit.decorator';
import { AuditService } from './audit.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private reflector: Reflector,
    private auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const meta = this.reflector.getAllAndOverride<AuditMeta>(AUDIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!meta) return next.handle();

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // No user means unauthenticated — skip audit
    if (!user) return next.handle();

    return next.handle().pipe(
      tap((response) => {
        const entityId = response?.[meta.idField ?? 'id'] ?? 'unknown';

        this.auditService
          .log({
            schoolId: user.schoolId,
            actorId: user.id,
            action: meta.action,
            entityType: meta.entityType,
            entityId: String(entityId),
            ipAddress: request.ip,
          })
          .catch(() => {
            // Audit log failures must never break the main request
          });
      }),
    );
  }
}
