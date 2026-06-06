import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FeedingService } from './feeding.service';
import { EnrollStudentDto, RecordPaymentDto, MarkPaidDto } from './dto/feeding.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StaffRolesGuard } from '../auth/guards/staff-roles.guard';
import { RequireStaffRole } from '../auth/decorators/staff-roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { StaffRole } from '@prisma/client';

// Feeding's feature-key mapping is inconsistent across package/role-defaults
// (see review notes), so access is enforced by role rather than the feature
// guard: enrollment is Owner/Admin; payment recording also allows Accountant.
@ApiTags('Feeding Fees')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, StaffRolesGuard)
@Controller('school/feeding')
export class FeedingController {
  constructor(private feedingService: FeedingService) {}

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

  // All-classes view — must be declared BEFORE `:classId` to avoid route shadowing
  @Get('daily')
  getSchoolDailyCollection(
    @CurrentUser() user: any,
    @Query('date') date: string,
  ) {
    return this.feedingService.getSchoolDailyCollection(user.schoolId, date);
  }

  @Get('daily/:classId')
  getDailyCollection(
    @CurrentUser() user: any,
    @Param('classId') classId: string,
    @Query('date') date: string,
  ) {
    return this.feedingService.getDailyCollection(user.schoolId, classId, date);
  }

  @Post('mark-paid')
  @RequireStaffRole(StaffRole.SCHOOL_OWNER, StaffRole.SCHOOL_ADMIN, StaffRole.ACCOUNTANT)
  markPaid(@CurrentUser() user: any, @Body() dto: MarkPaidDto) {
    return this.feedingService.markPaid(user.schoolId, dto, user.id);
  }

  @Post('pre-payment')
  @RequireStaffRole(StaffRole.SCHOOL_OWNER, StaffRole.SCHOOL_ADMIN, StaffRole.ACCOUNTANT)
  recordPrePayment(@CurrentUser() user: any, @Body() dto: RecordPaymentDto) {
    return this.feedingService.recordPrePayment(user.schoolId, dto, user.id);
  }

  @Get('reconciliation')
  getDailyReconciliation(@CurrentUser() user: any, @Query('date') date: string) {
    return this.feedingService.getDailyReconciliation(user.schoolId, date);
  }
}
