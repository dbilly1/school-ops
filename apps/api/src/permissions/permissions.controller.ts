import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PermissionAction, StaffRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StaffRolesGuard } from '../auth/guards/staff-roles.guard';
import { RequireStaffRole } from '../auth/decorators/staff-roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from './permissions.service';

// Feature-level VIEW checks the sidebar + route guard use to decide what a user
// can see. Computed through the permission engine (PermissionsService.can), so
// role defaults, role overrides AND user-level overrides all flow through.
const NAV_VIEW_CHECKS: { id: string; featureKey: string; subFeatureKey?: string }[] = [
  { id: 'admissions',    featureKey: 'admissions' },
  { id: 'academics',     featureKey: 'academics' },
  { id: 'attendance',    featureKey: 'attendance' },
  { id: 'finance',       featureKey: 'finance' },
  { id: 'expenses',      featureKey: 'finance', subFeatureKey: 'expense_management' },
  { id: 'feeding_fees',  featureKey: 'feeding_fees' },
  { id: 'transport',     featureKey: 'transport' },
  { id: 'communication', featureKey: 'communication' },
];

@ApiTags('Permissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('school/permissions')
export class PermissionsController {
  constructor(
    private prisma: PrismaService,
    private permissions: PermissionsService,
  ) {}

  /** All role permission defaults — global, not school-specific. Drives the
   *  Owner/Admin permission-management screens, so it stays management-only. */
  @Get('defaults')
  @UseGuards(StaffRolesGuard)
  @RequireStaffRole(StaffRole.SCHOOL_OWNER, StaffRole.SCHOOL_ADMIN)
  getDefaults() {
    return this.prisma.rolePermissionDefault.findMany();
  }

  /** Single permission check for the CURRENT user (used by usePermission /
   *  PermissionGate). Open to any authenticated staff — they only check their
   *  own effective permissions. */
  @Get('check')
  async check(
    @CurrentUser() user: any,
    @Query('featureKey') featureKey: string,
    @Query('action') action: PermissionAction,
    @Query('subFeatureKey') subFeatureKey?: string,
  ) {
    const can = await this.permissions.can({
      userId: user.id,
      schoolId: user.schoolId,
      roles: user.roles,
      featureKey,
      subFeatureKey: subFeatureKey || null,
      action,
    });
    return { can };
  }

  /** The current user's effective VIEW permission for every nav feature, in one
   *  round-trip — the sidebar + route guard use this so user-level overrides are
   *  honoured (not just role membership). */
  @Get('me')
  async me(@CurrentUser() user: any) {
    const entries = await Promise.all(
      NAV_VIEW_CHECKS.map(async (c) => [
        c.id,
        await this.permissions.can({
          userId: user.id,
          schoolId: user.schoolId,
          roles: user.roles,
          featureKey: c.featureKey,
          subFeatureKey: c.subFeatureKey ?? null,
          action: 'VIEW' as PermissionAction,
        }),
      ] as const),
    );
    return { nav: Object.fromEntries(entries) as Record<string, boolean> };
  }
}
