import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PlatformAnalyticsService } from './platform-analytics.service';
import { JwtSuperAdminGuard } from '../auth/guards/jwt-super-admin.guard';

@ApiTags('Super Admin — Analytics')
@ApiBearerAuth()
@UseGuards(JwtSuperAdminGuard)
@Controller('super-admin/analytics')
export class PlatformAnalyticsController {
  constructor(private analyticsService: PlatformAnalyticsService) {}

  @Get('dashboard')
  getDashboard() {
    return this.analyticsService.getDashboard();
  }

  @Get('audit-logs')
  getAuditLogs(
    @Query('schoolId') schoolId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.analyticsService.getSchoolAuditLogs(
      schoolId,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 50,
    );
  }
}
