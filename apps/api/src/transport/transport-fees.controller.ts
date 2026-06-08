import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TransportFeesService } from './transport-fees.service';
import { TransportPrepayDto, TransportRefundDto, TransportMarkPaidDto } from './dto/transport-fees.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StaffRolesGuard } from '../auth/guards/staff-roles.guard';
import { RequireStaffRole } from '../auth/decorators/staff-roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { StaffRole } from '@prisma/client';

// transport_fees has the same inconsistent feature-key mapping as feeding, so
// access is enforced by role: reads open; payment recording allows Accountant.
@ApiTags('Transport Fees')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, StaffRolesGuard)
@Controller('school/transport-fees')
export class TransportFeesController {
  constructor(private transportFeesService: TransportFeesService) {}

  @Get('daily/:routeId')
  getDailyCollection(
    @CurrentUser() user: any,
    @Param('routeId') routeId: string,
    @Query('date') date: string,
  ) {
    return this.transportFeesService.getDailyCollection(user.schoolId, routeId, date);
  }

  @Get('student/:studentId/calendar')
  getStudentCalendar(
    @CurrentUser() user: any,
    @Param('studentId') studentId: string,
    @Query('month') month: string,
  ) {
    return this.transportFeesService.getStudentCalendar(user.schoolId, studentId, month);
  }

  @Post('mark-paid')
  @RequireStaffRole(StaffRole.SCHOOL_OWNER, StaffRole.SCHOOL_ADMIN, StaffRole.ACCOUNTANT)
  markPaid(@CurrentUser() user: any, @Body() dto: TransportMarkPaidDto) {
    return this.transportFeesService.markPaid(user.schoolId, dto, user.id);
  }

  @Post('prepay')
  @RequireStaffRole(StaffRole.SCHOOL_OWNER, StaffRole.SCHOOL_ADMIN, StaffRole.ACCOUNTANT)
  prepay(@CurrentUser() user: any, @Body() dto: TransportPrepayDto) {
    return this.transportFeesService.prepay(user.schoolId, dto, user.id);
  }

  @Post('refund-balance')
  @RequireStaffRole(StaffRole.SCHOOL_OWNER, StaffRole.SCHOOL_ADMIN, StaffRole.ACCOUNTANT)
  refundBalance(@CurrentUser() user: any, @Body() dto: TransportRefundDto) {
    return this.transportFeesService.refundBalance(user.schoolId, dto, user.id);
  }

  @Get('reconciliation')
  getDailyReconciliation(@CurrentUser() user: any, @Query('date') date: string) {
    return this.transportFeesService.getDailyReconciliation(user.schoolId, date);
  }
}
