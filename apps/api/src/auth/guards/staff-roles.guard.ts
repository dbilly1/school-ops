import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { StaffRole } from '@prisma/client';
import { STAFF_ROLES_KEY } from '../decorators/staff-roles.decorator';

/**
 * Enforces `@RequireStaffRole(...)`. Routes without the decorator are allowed
 * (authentication is still enforced by JwtAuthGuard). Must run after
 * JwtAuthGuard so `request.user` is populated.
 */
@Injectable()
export class StaffRolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<StaffRole[]>(
      STAFF_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required || required.length === 0) return true;

    const user = context.switchToHttp().getRequest().user;
    const roles: StaffRole[] = user?.roles ?? [];

    if (!roles.some((r) => required.includes(r)))
      throw new ForbiddenException('Insufficient role for this action');

    return true;
  }
}
