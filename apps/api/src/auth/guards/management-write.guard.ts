import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { StaffRole } from '@prisma/client';

const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

/**
 * For school-setup / configuration controllers: any authenticated staff may
 * read (GET), but mutations (POST/PATCH/PUT/DELETE) are restricted to the
 * School Owner / School Admin. Applied at the class level — no per-route
 * decorators needed. Must run after JwtAuthGuard.
 */
@Injectable()
export class ManagementWriteGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    if (SAFE_METHODS.includes(req.method)) return true;

    const roles: StaffRole[] = req.user?.roles ?? [];
    if (
      roles.includes('SCHOOL_OWNER' as StaffRole) ||
      roles.includes('SCHOOL_ADMIN' as StaffRole)
    )
      return true;

    throw new ForbiddenException(
      'Only the School Owner or a School Admin can modify school setup',
    );
  }
}
