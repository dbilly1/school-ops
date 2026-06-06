import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuditAction } from '@prisma/client';
import { AuditViewerService } from './audit-viewer.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtSuperAdminGuard } from '../super-admin/auth/guards/jwt-super-admin.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Audit Logs')
@ApiBearerAuth()
@Controller('school/audit-logs')
export class SchoolAuditViewerController {
  constructor(private auditViewer: AuditViewerService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
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
