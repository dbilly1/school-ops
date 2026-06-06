import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  PERMISSION_KEY,
  PermissionRequirement,
} from './decorators/require-permission.decorator';
import { PermissionsService } from './permissions.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private permissions: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement = this.reflector.getAllAndOverride<PermissionRequirement>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requirement) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) return false;

    const allowed = await this.permissions.can({
      userId: user.id,
      schoolId: user.schoolId,
      roles: user.roles,
      featureKey: requirement.featureKey,
      subFeatureKey: requirement.subFeatureKey,
      action: requirement.action as any,
    });

    if (!allowed) throw new ForbiddenException('Insufficient permissions');

    return true;
  }
}
