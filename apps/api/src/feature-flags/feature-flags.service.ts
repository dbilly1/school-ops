import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionCacheService } from '../cache/permission-cache.service';

@Injectable()
export class FeatureFlagsService {
  constructor(
    private prisma: PrismaService,
    private cache: PermissionCacheService,
  ) {}

  async isFeatureActive(schoolId: string, featureKey: string): Promise<boolean> {
    return this.cache.wrap(schoolId, `featActive:${featureKey}`, async () => {
      // Check school's own activation state
      const schoolFeature = await this.prisma.schoolFeature.findUnique({
        where: { schoolId_featureKey: { schoolId, featureKey } },
      });

      if (schoolFeature?.state === 'ACTIVE') return true;

      // Check a-la-carte grants as fallback
      return this.hasActiveGrant(schoolId, featureKey, null);
    });
  }

  async isSubFeatureEnabled(
    schoolId: string,
    featureKey: string,
    subFeatureKey: string,
    // Callers that already verified the parent feature is active (e.g. the
    // permission/feature guards) pass it in so we don't re-query it.
    parentActive?: boolean,
  ): Promise<boolean> {
    const isParentActive =
      parentActive ?? (await this.isFeatureActive(schoolId, featureKey));
    if (!isParentActive) return false;

    return this.cache.wrap(
      schoolId,
      `subEnabled:${featureKey}:${subFeatureKey}`,
      async () => {
        // Check school's explicit sub-feature config
        const config = await this.prisma.schoolSubFeatureConfig.findUnique({
          where: {
            schoolId_featureKey_subFeatureKey: { schoolId, featureKey, subFeatureKey },
          },
        });

        if (config) return config.enabled;

        // Check a-la-carte grant for sub-feature
        const hasGrant = await this.hasActiveGrant(schoolId, featureKey, subFeatureKey);
        if (hasGrant) return true;

        // Fall back to platform default
        const defaultConfig = await this.prisma.subFeatureDefault.findUnique({
          where: { featureKey_subFeatureKey: { featureKey, subFeatureKey } },
        });

        return defaultConfig?.defaultEnabled ?? false;
      },
    );
  }

  async isAvailableInPackage(
    schoolId: string,
    featureKey: string,
    subFeatureKey?: string | null,
  ): Promise<boolean> {
    const sub = subFeatureKey ?? null;
    return this.cache.wrap(schoolId, `pkg:${featureKey}:${sub}`, async () => {
      const school = await this.prisma.school.findUnique({
        where: { id: schoolId },
        select: { packageId: true },
      });

      if (!school?.packageId) return false;

      const packageFeature = await this.prisma.packageFeature.findFirst({
        where: {
          packageId: school.packageId,
          featureKey,
          subFeatureKey: sub,
        },
      });

      if (packageFeature) return true;

      return this.hasActiveGrant(schoolId, featureKey, sub);
    });
  }

  private async hasActiveGrant(
    schoolId: string,
    featureKey: string,
    subFeatureKey: string | null,
  ): Promise<boolean> {
    const grant = await this.prisma.schoolFeatureGrant.findFirst({
      where: {
        schoolId,
        featureKey,
        subFeatureKey: subFeatureKey ?? null,
        OR: [
          { grantType: 'PERMANENT' },
          { grantType: 'TEMPORARY', expiresAt: { gt: new Date() } },
        ],
      },
    });

    return !!grant;
  }
}
