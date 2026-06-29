import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StaffRolesGuard } from '../auth/guards/staff-roles.guard';
import { RequireStaffRole } from '../auth/decorators/staff-roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { StaffRole } from '@prisma/client';

// Aggregate reports (financials, performance) are management-level.
@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, StaffRolesGuard)
@RequireStaffRole(StaffRole.SCHOOL_OWNER, StaffRole.SCHOOL_ADMIN, StaffRole.ACCOUNTANT)
@Controller('school/reports')
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get('enrollment')
  enrollment(@CurrentUser() user: any, @Query('academicYearId') academicYearId?: string) {
    return this.reportsService.enrollmentReport(user.schoolId, academicYearId);
  }

  @Get('attendance')
  attendance(
    @CurrentUser() user: any,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('classId') classId?: string,
  ) {
    return this.reportsService.attendanceReport(user.schoolId, startDate, endDate, classId);
  }

  @Get('attendance/daily')
  attendanceDaily(
    @CurrentUser() user: any,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('classId') classId?: string,
  ) {
    return this.reportsService.attendanceDaily(user.schoolId, startDate, endDate, classId);
  }

  @Get('attendance/coverage')
  attendanceCoverage(
    @CurrentUser() user: any,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.reportsService.attendanceCoverage(user.schoolId, startDate, endDate);
  }

  @Get('academics')
  academics(
    @CurrentUser() user: any,
    @Query('termId') termId: string,
    @Query('classId') classId?: string,
  ) {
    return this.reportsService.academicReport(user.schoolId, termId, classId);
  }

  @Get('fee-balances')
  feeBalances(@CurrentUser() user: any, @Query('termId') termId: string) {
    return this.reportsService.feeBalancesReport(user.schoolId, termId);
  }

  @Get('transport')
  transport(@CurrentUser() user: any) {
    return this.reportsService.transportReport(user.schoolId);
  }

  @Get('transport/daily')
  transportDaily(
    @CurrentUser() user: any,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('routeId') routeId?: string,
  ) {
    return this.reportsService.transportDaily(user.schoolId, startDate, endDate, routeId);
  }

  @Get('feeding')
  feeding(
    @CurrentUser() user: any,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.reportsService.feedingReport(user.schoolId, startDate, endDate);
  }

  @Get('transport/cash-counts')
  transportCashCounts(
    @CurrentUser() user: any,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.reportsService.cashReconciliations(user.schoolId, 'TRANSPORT', startDate, endDate);
  }

  @Get('feeding/cash-counts')
  feedingCashCounts(
    @CurrentUser() user: any,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.reportsService.cashReconciliations(user.schoolId, 'FEEDING', startDate, endDate);
  }

  @Get('performance/:studentId')
  performance(@CurrentUser() user: any, @Param('studentId') studentId: string) {
    return this.reportsService.performanceTracking(user.schoolId, studentId);
  }
}
