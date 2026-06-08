import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FeedingService } from './feeding.service';
import {
  EnrollStudentDto, MarkPaidDto, FeedingExemptDto,
  FeedingPrepayDto, FeedingRefundDto, FeedingSettleArrearsDto,
} from './dto/feeding.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StaffRolesGuard } from '../auth/guards/staff-roles.guard';
import { RequireStaffRole } from '../auth/decorators/staff-roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { StaffRole } from '@prisma/client';

// Feeding's feature-key mapping is inconsistent across package/role-defaults
// (see review notes), so access is enforced by role rather than the feature
// guard: enrollment/exemptions are Owner/Admin; payments also allow Accountant.
@ApiTags('Feeding Fees')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, StaffRolesGuard)
@Controller('school/feeding')
export class FeedingController {
  constructor(private feedingService: FeedingService) {}

  // ── Exemptions (opt-out) ──
  @Get('exempt')
  getExemptStudents(@CurrentUser() user: any) {
    return this.feedingService.getExemptStudents(user.schoolId);
  }

  @Post('exempt')
  @RequireStaffRole(StaffRole.SCHOOL_OWNER, StaffRole.SCHOOL_ADMIN)
  exemptStudent(@CurrentUser() user: any, @Body() dto: FeedingExemptDto) {
    return this.feedingService.exemptStudentActiveYear(user.schoolId, dto.studentId);
  }

  @Post('include')
  @RequireStaffRole(StaffRole.SCHOOL_OWNER, StaffRole.SCHOOL_ADMIN)
  includeStudent(@CurrentUser() user: any, @Body() dto: FeedingExemptDto) {
    return this.feedingService.includeStudentActiveYear(user.schoolId, dto.studentId);
  }

  @Post('enroll')
  @RequireStaffRole(StaffRole.SCHOOL_OWNER, StaffRole.SCHOOL_ADMIN)
  enrollStudent(@CurrentUser() user: any, @Body() dto: EnrollStudentDto) {
    return this.feedingService.enrollStudent(user.schoolId, dto);
  }

  @Delete('enroll/:studentId/:yearId')
  @RequireStaffRole(StaffRole.SCHOOL_OWNER, StaffRole.SCHOOL_ADMIN)
  unenroll(
    @CurrentUser() user: any,
    @Param('studentId') studentId: string,
    @Param('yearId') yearId: string,
  ) {
    return this.feedingService.unenrollStudent(user.schoolId, studentId, yearId);
  }

  // ── Daily collection ──
  @Get('daily/:classId')
  getDailyCollection(
    @CurrentUser() user: any,
    @Param('classId') classId: string,
    @Query('date') date: string,
  ) {
    return this.feedingService.getDailyCollection(user.schoolId, classId, date);
  }

  @Get('student/:studentId/calendar')
  getStudentCalendar(
    @CurrentUser() user: any,
    @Param('studentId') studentId: string,
    @Query('month') month: string,
  ) {
    return this.feedingService.getStudentCalendar(user.schoolId, studentId, month);
  }

  // ── Payments ──
  @Post('mark-paid')
  @RequireStaffRole(StaffRole.SCHOOL_OWNER, StaffRole.SCHOOL_ADMIN, StaffRole.ACCOUNTANT)
  markPaid(@CurrentUser() user: any, @Body() dto: MarkPaidDto) {
    return this.feedingService.markPaid(user.schoolId, dto, user.id);
  }

  @Post('prepay')
  @RequireStaffRole(StaffRole.SCHOOL_OWNER, StaffRole.SCHOOL_ADMIN, StaffRole.ACCOUNTANT)
  prepay(@CurrentUser() user: any, @Body() dto: FeedingPrepayDto) {
    return this.feedingService.prepay(user.schoolId, dto, user.id);
  }

  @Post('refund-balance')
  @RequireStaffRole(StaffRole.SCHOOL_OWNER, StaffRole.SCHOOL_ADMIN, StaffRole.ACCOUNTANT)
  refundBalance(@CurrentUser() user: any, @Body() dto: FeedingRefundDto) {
    return this.feedingService.refundBalance(user.schoolId, dto, user.id);
  }

  @Post('settle-arrears')
  @RequireStaffRole(StaffRole.SCHOOL_OWNER, StaffRole.SCHOOL_ADMIN, StaffRole.ACCOUNTANT)
  settleArrears(@CurrentUser() user: any, @Body() dto: FeedingSettleArrearsDto) {
    return this.feedingService.settleArrears(user.schoolId, dto, user.id);
  }

  @Get('reconciliation')
  getDailyReconciliation(@CurrentUser() user: any, @Query('date') date: string) {
    return this.feedingService.getDailyReconciliation(user.schoolId, date);
  }
}
