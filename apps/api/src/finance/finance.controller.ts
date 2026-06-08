import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FinanceService } from './finance.service';
import { CreateFeeStructureDto, CreateInvoiceDto, RecordPaymentDto, AssignStudentCategoryDto, BulkCreateFeeStructuresDto, SaveFeeMatrixDto } from './dto/finance.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Finance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('school/finance')
export class FinanceController {
  constructor(private financeService: FinanceService) {}

  // Fee structures
  @Get('fee-structures')
  @RequirePermission('finance', 'VIEW')
  findFeeStructures(@CurrentUser() user: any, @Query('termId') termId?: string) {
    return this.financeService.findFeeStructures(user.schoolId, termId);
  }

  @Post('fee-structures/matrix')
  @RequirePermission('finance', 'CREATE')
  saveFeeMatrix(@CurrentUser() user: any, @Body() dto: SaveFeeMatrixDto) {
    return this.financeService.saveFeeMatrix(user.schoolId, dto);
  }

  @Post('fee-structures/bulk')
  @RequirePermission('finance', 'CREATE')
  bulkCreateFeeStructures(@CurrentUser() user: any, @Body() dto: BulkCreateFeeStructuresDto) {
    return this.financeService.bulkCreateFeeStructures(user.schoolId, dto);
  }

  @Post('fee-structures')
  @RequirePermission('finance', 'CREATE')
  createFeeStructure(@CurrentUser() user: any, @Body() dto: CreateFeeStructureDto) {
    return this.financeService.createFeeStructure(user.schoolId, dto);
  }

  @Patch('fee-structures/:id')
  @RequirePermission('finance', 'EDIT')
  updateFeeStructure(@CurrentUser() user: any, @Param('id') id: string, @Body('amount') amount: number) {
    return this.financeService.updateFeeStructure(user.schoolId, id, amount);
  }

  @Delete('fee-structures/:id')
  @RequirePermission('finance', 'DELETE')
  deleteFeeStructure(@CurrentUser() user: any, @Param('id') id: string) {
    return this.financeService.deleteFeeStructure(user.schoolId, id);
  }

  // Student category assignment
  @Patch('students/:studentId/category')
  @RequirePermission('finance', 'EDIT')
  assignStudentCategory(
    @CurrentUser() user: any,
    @Param('studentId') studentId: string,
    @Body() dto: AssignStudentCategoryDto,
  ) {
    return this.financeService.assignStudentCategory(user.schoolId, studentId, dto);
  }

  // Invoices
  @Get('invoices')
  @RequirePermission('finance', 'VIEW')
  findInvoices(
    @CurrentUser() user: any,
    @Query('termId') termId?: string,
    @Query('classId') classId?: string,
  ) {
    return this.financeService.findInvoices(user.schoolId, termId, classId);
  }

  @Get('invoices/:id')
  @RequirePermission('finance', 'VIEW')
  findInvoice(@CurrentUser() user: any, @Param('id') id: string) {
    return this.financeService.findInvoice(user.schoolId, id);
  }

  @Post('invoices')
  @RequirePermission('finance', 'CREATE')
  createInvoice(@CurrentUser() user: any, @Body() dto: CreateInvoiceDto) {
    return this.financeService.createInvoice(user.schoolId, dto);
  }

  @Post('invoices/generate/:termId')
  @RequirePermission('finance', 'CREATE')
  generateTermInvoices(@CurrentUser() user: any, @Param('termId') termId: string) {
    return this.financeService.generateTermInvoices(user.schoolId, termId);
  }

  // Payments
  @Post('invoices/:id/payments')
  @RequirePermission('finance', 'CREATE')
  recordPayment(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: RecordPaymentDto,
  ) {
    return this.financeService.recordPayment(user.schoolId, id, dto, user.id);
  }

  // Recent payments (transactions feed)
  @Get('payments/recent')
  @RequirePermission('finance', 'VIEW')
  findRecentPayments(
    @CurrentUser() user: any,
    @Query('limit') limit?: string,
    @Query('termId') termId?: string,
    @Query('method') method?: string,
  ) {
    return this.financeService.findRecentPayments(
      user.schoolId,
      limit ? parseInt(limit, 10) : 50,
      termId,
      method,
    );
  }

  // Outstanding balances
  @Get('outstanding')
  @RequirePermission('finance', 'VIEW')
  getOutstandingBalances(
    @CurrentUser() user: any,
    @Query('termId') termId: string,
    @Query('classId') classId?: string,
  ) {
    return this.financeService.getOutstandingBalances(user.schoolId, termId, classId);
  }
}
