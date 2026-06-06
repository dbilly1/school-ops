import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FeatureFlagsService {
  constructor(private prisma: PrismaService) {}

  async isFeatureActive(schoolId: string, featureKey: string): Promise<boolean> {
    // Check school's own activation state
    const schoolFeature = await this.prisma.schoolFeature.findUnique({
      where: { schoolId_featureKey: { schoolId, featureKey } },
    });

    if (schoolFeature?.state === 'ACTIVE') return true;

    // Check a-la-carte grants as fallback
    return this.hasActiveGrant(schoolId, featureKey, null);
  }

  async isSubFeatureEnabled(
    schoolId: string,
    featureKey: string,
    subFeatureKey: string,
  ): Promise<boolean> {
    // Parent feature must be active first
    const parentActive = await this.isFeatureActive(schoolId, featureKey);
    if (!parentActive) return false;

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
  }

  async isAvailableInPackage(
    schoolId: string,
    featureKey: string,
    subFeatureKey?: string | null,
  ): Promise<boolean> {
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: { packageId: true },
    });

    if (!school?.packageId) return false;

    const packageFeature = await this.prisma.packageFeature.findFirst({
      where: {
        packageId: school.packageId,
        featureKey,
        subFeatureKey: subFeatureKey ?? null,
      },
    });

    if (packageFeature) return true;

    return this.hasActiveGrant(schoolId, featureKey, subFeatureKey ?? null);
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
