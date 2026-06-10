import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TransportFeesService } from './transport-fees.service';
import { TransportPrepayDto, TransportRefundDto, TransportSettleArrearsDto, TransportMarkPaidDto } from './dto/transport-fees.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

// Recording daily transport fees is its own grantable permission
// (transport / fee_collection) so a school can let someone collect fees without
// any other transport access. Owner/Admin bypass the engine as usual.
@ApiTags('Transport Fees')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('school/transport-fees')
export class TransportFeesController {
  constructor(private transportFeesService: TransportFeesService) {}

  @Get('daily/:routeId')
  @RequirePermission('transport', 'VIEW', 'fee_collection')
  getDailyCollection(
    @CurrentUser() user: any,
    @Param('routeId') routeId: string,
    @Query('date') date: string,
  ) {
    return this.transportFeesService.getDailyCollection(user.schoolId, routeId, date);
  }

  @Get('student/:studentId/calendar')
  @RequirePermission('transport', 'VIEW', 'fee_collection')
  getStudentCalendar(
    @CurrentUser() user: any,
    @Param('studentId') studentId: string,
    @Query('month') month: string,
  ) {
    return this.transportFeesService.getStudentCalendar(user.schoolId, studentId, month);
  }

  @Post('mark-paid')
  @RequirePermission('transport', 'CREATE', 'fee_collection')
  markPaid(@CurrentUser() user: any, @Body() dto: TransportMarkPaidDto) {
    return this.transportFeesService.markPaid(user.schoolId, dto, user.id);
  }

  @Post('prepay')
  @RequirePermission('transport', 'CREATE', 'fee_collection')
  prepay(@CurrentUser() user: any, @Body() dto: TransportPrepayDto) {
    return this.transportFeesService.prepay(user.schoolId, dto, user.id);
  }

  @Post('refund-balance')
  @RequirePermission('transport', 'CREATE', 'fee_collection')
  refundBalance(@CurrentUser() user: any, @Body() dto: TransportRefundDto) {
    return this.transportFeesService.refundBalance(user.schoolId, dto, user.id);
  }

  @Post('settle-arrears')
  @RequirePermission('transport', 'CREATE', 'fee_collection')
  settleArrears(@CurrentUser() user: any, @Body() dto: TransportSettleArrearsDto) {
    return this.transportFeesService.settleArrears(user.schoolId, dto, user.id);
  }

  @Get('reconciliation')
  @RequirePermission('transport', 'VIEW', 'fee_collection')
  getDailyReconciliation(@CurrentUser() user: any, @Query('date') date: string) {
    return this.transportFeesService.getDailyReconciliation(user.schoolId, date);
  }
}
