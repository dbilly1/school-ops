import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FeatureState } from '@prisma/client';
import { BulkConfigureFeaturesDto } from './dto/features.dto';
import { PermissionCacheService } from '../../cache/permission-cache.service';

@Injectable()
export class FeaturesService {
  constructor(
    private prisma: PrismaService,
    private cache: PermissionCacheService,
  ) {}

  // ── Bulk configure (onboarding) ───────────────────────────────────────────

  async bulkConfigureFeatures(schoolId: string, dto: BulkConfigureFeaturesDto) {
    // Fan out all features in parallel — each is independent
    await Promise.all(
      dto.features.map(async (item) => {
        if (!item.active) return; // Skip inactive features — leave them as AVAILABLE

        // Activate the feature (upsert)
        await this.prisma.schoolFeature.upsert({
          where: { schoolId_featureKey: { schoolId, featureKey: item.featureKey } },
          create: { schoolId, featureKey: item.featureKey, state: FeatureState.ACTIVE, activatedAt: new Date() },
          update: { state: FeatureState.ACTIVE, activatedAt: new Date() },
        });

        // Apply sub-feature configs in parallel
        if (item.subFeatures.length > 0) {
          await Promise.all(
            item.subFeatures.map((sf) =>
              this.prisma.schoolSubFeatureConfig.upsert({
                where: {
                  schoolId_featureKey_subFeatureKey: {
                    schoolId,
                    featureKey: item.featureKey,
                    subFeatureKey: sf.subFeatureKey,
                  },
                },
                create: { schoolId, featureKey: item.featureKey, subFeatureKey: sf.subFeatureKey, enabled: sf.enabled },
                update: { enabled: sf.enabled },
              }),
            ),
          );
        }
      }),
    );

    this.cache.invalidateSchool(schoolId);
    return { configured: dto.features.filter(f => f.active).length };
  }

  // ── List all features for a school (with state + sub-features) ────────────

  async listFeatures(schoolId: string) {
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: { packageId: true },
    });

    const packageFeatures = school?.packageId
      ? await this.prisma.packageFeature.findMany({
          where: { packageId: school.packageId },
        })
      : [];

    // Also include a-la-carte grants
    const grants = await this.prisma.schoolFeatureGrant.findMany({
      where: {
        schoolId,
        OR: [
          { grantType: 'PERMANENT' },
          { grantType: 'TEMPORARY', expiresAt: { gt: new Date() } },
        ],
      },
    });

    // Build a set of available top-level feature keys
    const topLevelPackageKeys = new Set(
      packageFeatures.filter(f => f.subFeatureKey === null).map(f => f.featureKey),
    );
    const topLevelGrantKeys = new Set(
      grants.filter(g => g.subFeatureKey === null).map(g => g.featureKey),
    );
    const availableFeatureKeys = new Set([...topLevelPackageKeys, ...topLevelGrantKeys]);

    // Fetch current school feature states
    const schoolFeatures = await this.prisma.schoolFeature.findMany({
      where: { schoolId },
    });
    const stateMap = new Map(schoolFeatures.map(f => [f.featureKey, f.state]));

    // Build sub-feature data per top-level feature
    const result = [];

    for (const featureKey of availableFeatureKeys) {
      const state: FeatureState = stateMap.get(featureKey) ?? FeatureState.AVAILABLE;

      // Sub-features available in package or via grant
      const subPackageKeys = packageFeatures
        .filter(f => f.featureKey === featureKey && f.subFeatureKey !== null)
        .map(f => f.subFeatureKey!);
      const subGrantKeys = grants
        .filter(g => g.featureKey === featureKey && g.subFeatureKey !== null)
        .map(g => g.subFeatureKey!);
      const subFeatureKeys = [...new Set([...subPackageKeys, ...subGrantKeys])];

      // Fetch school sub-feature configs and platform defaults
      const [configs, defaults] = await Promise.all([
        this.prisma.schoolSubFeatureConfig.findMany({
          where: { schoolId, featureKey },
        }),
        this.prisma.subFeatureDefault.findMany({
          where: { featureKey },
        }),
      ]);

      const configMap = new Map(configs.map(c => [c.subFeatureKey, c.enabled]));
      const defaultMap = new Map(defaults.map(d => [d.subFeatureKey, d.defaultEnabled]));

      const subFeatures = subFeatureKeys.map(subKey => ({
        subFeatureKey: subKey,
        enabled: configMap.has(subKey)
          ? configMap.get(subKey)!
          : (defaultMap.get(subKey) ?? false),
      }));

      result.push({ featureKey, state, subFeatures });
    }

    return result;
  }

  // ── Get single feature state ──────────────────────────────────────────────

  async getFeatureState(schoolId: string, featureKey: string) {
    // If the school explicitly activated this feature (e.g. during onboarding),
    // honour that directly — don't gate it behind package/grant availability.
    const schoolFeature = await this.prisma.schoolFeature.findUnique({
      where: { schoolId_featureKey: { schoolId, featureKey } },
    });

    if (schoolFeature?.state === FeatureState.ACTIVE) {
      return { state: FeatureState.ACTIVE };
    }

    // Feature not activated — check whether it's available in their package/grant
    const available = await this.isAvailableForSchool(schoolId, featureKey, null);
    if (!available) return { state: FeatureState.UNAVAILABLE };

    return { state: schoolFeature?.state ?? FeatureState.AVAILABLE };
  }

  // ── Activate a feature (AVAILABLE → ACTIVE) ───────────────────────────────

  async activateFeature(schoolId: string, featureKey: string) {
    const available = await this.isAvailableForSchool(schoolId, featureKey, null);
    if (!available) {
      throw new ForbiddenException('This feature is not included in your package.');
    }

    const existing = await this.prisma.schoolFeature.findUnique({
      where: { schoolId_featureKey: { schoolId, featureKey } },
    });

    if (existing?.state === FeatureState.ACTIVE) {
      return { featureKey, state: FeatureState.ACTIVE };
    }

    const schoolFeature = await this.prisma.schoolFeature.upsert({
      where: { schoolId_featureKey: { schoolId, featureKey } },
      create: {
        schoolId,
        featureKey,
        state: FeatureState.ACTIVE,
        activatedAt: new Date(),
      },
      update: {
        state: FeatureState.ACTIVE,
        activatedAt: new Date(),
      },
    });

    // Apply platform sub-feature defaults on first activation
    await this.applySubFeatureDefaults(schoolId, featureKey);

    this.cache.invalidateSchool(schoolId);
    return { featureKey, state: schoolFeature.state };
  }

  // ── Deactivate a feature (ACTIVE → AVAILABLE) ────────────────────────────

  async deactivateFeature(schoolId: string, featureKey: string) {
    const existing = await this.prisma.schoolFeature.findUnique({
      where: { schoolId_featureKey: { schoolId, featureKey } },
    });

    if (!existing || existing.state !== FeatureState.ACTIVE) {
      throw new BadRequestException('Feature is not currently active.');
    }

    const updated = await this.prisma.schoolFeature.update({
      where: { schoolId_featureKey: { schoolId, featureKey } },
      data: { state: FeatureState.AVAILABLE },
    });

    this.cache.invalidateSchool(schoolId);
    return { featureKey, state: updated.state };
  }

  // ── Get sub-feature enabled state ─────────────────────────────────────────

  async getSubFeatureState(schoolId: string, featureKey: string, subFeatureKey: string) {
    const featureState = await this.getFeatureState(schoolId, featureKey);
    if (featureState.state !== FeatureState.ACTIVE) {
      return { enabled: false };
    }

    const config = await this.prisma.schoolSubFeatureConfig.findUnique({
      where: {
        schoolId_featureKey_subFeatureKey: { schoolId, featureKey, subFeatureKey },
      },
    });

    if (config) return { enabled: config.enabled };

    const hasGrant = await this.isAvailableForSchool(schoolId, featureKey, subFeatureKey);
    if (hasGrant) return { enabled: true };

    const platformDefault = await this.prisma.subFeatureDefault.findUnique({
      where: { featureKey_subFeatureKey: { featureKey, subFeatureKey } },
    });

    return { enabled: platformDefault?.defaultEnabled ?? false };
  }

  // ── Toggle a sub-feature on/off ───────────────────────────────────────────

  async setSubFeatureEnabled(
    schoolId: string,
    featureKey: string,
    subFeatureKey: string,
    enabled: boolean,
  ) {
    const featureState = await this.getFeatureState(schoolId, featureKey);
    if (featureState.state !== FeatureState.ACTIVE) {
      throw new BadRequestException('Parent feature must be active before toggling sub-features.');
    }

    const available = await this.isAvailableForSchool(schoolId, featureKey, subFeatureKey);
    if (!available) {
      throw new ForbiddenException('This sub-feature is not included in your package.');
    }

    await this.prisma.schoolSubFeatureConfig.upsert({
      where: {
        schoolId_featureKey_subFeatureKey: { schoolId, featureKey, subFeatureKey },
      },
      create: { schoolId, featureKey, subFeatureKey, enabled },
      update: { enabled },
    });

    this.cache.invalidateSchool(schoolId);
    return { featureKey, subFeatureKey, enabled };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async isAvailableForSchool(
    schoolId: string,
    featureKey: string,
    subFeatureKey: string | null,
  ): Promise<boolean> {
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: { packageId: true },
    });

    if (school?.packageId) {
      const inPackage = await this.prisma.packageFeature.findFirst({
        where: { packageId: school.packageId, featureKey, subFeatureKey },
      });
      if (inPackage) return true;
    }

    const grant = await this.prisma.schoolFeatureGrant.findFirst({
      where: {
        schoolId,
        featureKey,
        subFeatureKey,
        OR: [
          { grantType: 'PERMANENT' },
          { grantType: 'TEMPORARY', expiresAt: { gt: new Date() } },
        ],
      },
    });

    return !!grant;
  }

  private async applySubFeatureDefaults(schoolId: string, featureKey: string) {
    const defaults = await this.prisma.subFeatureDefault.findMany({
      where: { featureKey },
    });

    for (const def of defaults) {
      await this.prisma.schoolSubFeatureConfig.upsert({
        where: {
          schoolId_featureKey_subFeatureKey: {
            schoolId,
            featureKey,
            subFeatureKey: def.subFeatureKey,
          },
        },
        create: {
          schoolId,
          featureKey,
          subFeatureKey: def.subFeatureKey,
          enabled: def.defaultEnabled,
        },
        update: {},
      });
    }
  }
}
