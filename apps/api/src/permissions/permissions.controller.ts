import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { StaffRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StaffRolesGuard } from '../auth/guards/staff-roles.guard';
import { RequireStaffRole } from '../auth/decorators/staff-roles.decorator';
import { PrismaService } from '../prisma/prisma.service';

// The permission matrix drives the Owner/Admin permission-management screens —
// not data any other staff role needs to read.
@ApiTags('Permissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, StaffRolesGuard)
@RequireStaffRole(StaffRole.SCHOOL_OWNER, StaffRole.SCHOOL_ADMIN)
@Controller('school/permissions')
export class PermissionsController {
  constructor(private prisma: PrismaService) {}

  /** All role permission defaults — global, not school-specific */
  @Get('defaults')
  getDefaults() {
    return this.prisma.rolePermissionDefault.findMany();
  }
}
