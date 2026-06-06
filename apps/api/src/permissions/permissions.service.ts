import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { PermissionAction, StaffRole } from '@prisma/client';

interface PermissionCheckInput {
  userId: string;
  schoolId: string;
  roles: StaffRole[];
  featureKey: string;
  subFeatureKey?: string | null;
  action: PermissionAction;
}

@Injectable()
export class PermissionsService {
  constructor(
    private prisma: PrismaService,
    private featureFlags: FeatureFlagsService,
  ) {}

  async can(input: PermissionCheckInput): Promise<boolean> {
    const { userId, schoolId, roles, featureKey, subFeatureKey, action } = input;
    const sub = subFeatureKey ?? null;

    // Step 1 — Package check
    const inPackage = await this.featureFlags.isAvailableInPackage(
      schoolId,
      featureKey,
      sub,
    );
    if (!inPackage) return false;

    // Step 2 — School feature state
    const featureActive = await this.featureFlags.isFeatureActive(schoolId, featureKey);
    if (!featureActive) return false;

    // Step 3 — Sub-feature state
    if (sub) {
      const subActive = await this.featureFlags.isSubFeatureEnabled(
        schoolId,
        featureKey,
        sub,
      );
      if (!subActive) return false;
    }

    // Step 4 — School Owner and School Admin bypass all remaining checks
    if (roles.includes('SCHOOL_OWNER' as StaffRole) || roles.includes('SCHOOL_ADMIN' as StaffRole)) {
      return true;
    }

    // Step 5 — User-level override
    const userOverride = await this.prisma.userPermissionOverride.findFirst({
      where: { schoolId, userId, featureKey, subFeatureKey: sub, action },
    });
    if (userOverride) return userOverride.granted;

    // Step 6 — Role-level overrides (union across all roles). An explicit grant
    // wins; failing that, an explicit deny blocks (M2 — deny was previously
    // ignored). Only when no role has an override do we fall through to defaults.
    const roleOverrides = await this.prisma.rolePermissionOverride.findMany({
      where: { schoolId, role: { in: roles }, featureKey, subFeatureKey: sub, action },
    });
    if (roleOverrides.some((o) => o.granted)) return true;
    if (roleOverrides.length > 0) return false;

    // Step 7 — Role defaults (union across all roles)
    for (const role of roles) {
      const defaultPerm = await this.prisma.rolePermissionDefault.findFirst({
        where: { role, featureKey, subFeatureKey: sub, action },
      });
      if (defaultPerm?.allowed) return true;
    }

    return false;
  }
}
