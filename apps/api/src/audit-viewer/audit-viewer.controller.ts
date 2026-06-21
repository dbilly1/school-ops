import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuditAction, StaffRole } from '@prisma/client';
import { AuditViewerService } from './audit-viewer.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StaffRolesGuard } from '../auth/guards/staff-roles.guard';
import { RequireStaffRole } from '../auth/decorators/staff-roles.decorator';
import { JwtSuperAdminGuard } from '../super-admin/auth/guards/jwt-super-admin.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

// The audit trail exposes every staff member's write activity — management only.
@ApiTags('Audit Logs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, StaffRolesGuard)
@RequireStaffRole(StaffRole.SCHOOL_OWNER, StaffRole.SCHOOL_ADMIN)
@Controller('school/audit-logs')
export class SchoolAuditViewerController {
  constructor(private auditViewer: AuditViewerService) {}

  @Get()
  query(
    @CurrentUser() user: any,
    @Query('actorId') actorId?: string,
    @Query('action') action?: AuditAction,
    @Query('entityType') entityType?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.auditViewer.queryForSchool(user.schoolId, {
      actorId, action, entityType, startDate, endDate,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get('summary')
  summary(@CurrentUser() user: any) {
    return this.auditViewer.summaryForSchool(user.schoolId);
  }
}

@ApiTags('Super Admin — Audit Logs')
@ApiBearerAuth()
@Controller('super-admin/audit-logs')
export class PlatformAuditViewerController {
  constructor(private auditViewer: AuditViewerService) {}

  @Get()
  @UseGuards(JwtSuperAdminGuard)
  query(
    @Query('actorId') actorId?: string,
    @Query('action') action?: AuditAction,
    @Query('entityType') entityType?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.auditViewer.queryAllTenants({
      actorId, action, entityType, startDate, endDate,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }
}
