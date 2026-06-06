import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FEATURE_KEY, FeatureRequirement } from './decorators/require-feature.decorator';
import { FeatureFlagsService } from './feature-flags.service';

@Injectable()
export class FeatureFlagsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private featureFlags: FeatureFlagsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement = this.reflector.getAllAndOverride<FeatureRequirement>(
      FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requirement) return true;

    const request = context.switchToHttp().getRequest();
    const schoolId = request.user?.schoolId;
    if (!schoolId) return false;

    const { featureKey, subFeatureKey } = requirement;

    const featureActive = await this.featureFlags.isFeatureActive(schoolId, featureKey);
    if (!featureActive) {
      throw new ForbiddenException(`Feature '${featureKey}' is not active for this school`);
    }

    if (subFeatureKey) {
      const subActive = await this.featureFlags.isSubFeatureEnabled(
        schoolId,
        featureKey,
        subFeatureKey,
      );
      if (!subActive) {
        throw new ForbiddenException(
          `Sub-feature '${subFeatureKey}' is not enabled for this school`,
        );
      }
    }

    return true;
  }
}
