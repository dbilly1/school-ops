import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CostCenter } from '@prisma/client';
import { ExpensesService } from '../finance/expenses/expenses.service';
import {
  CreateExpenseCategoryDto, UpdateExpenseCategoryDto,
  CreateExpenseDto, UpdateExpenseDto,
} from '../finance/expenses/dto/expenses.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

// Transport's own expenses (fuel, spare parts, …). Reuses the shared
// ExpensesService pinned to the TRANSPORT cost center, gated by the transport
// permission so a transport officer can record spend without finance access.
@ApiTags('Transport')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('school/transport')
export class TransportExpensesController {
  private readonly center = CostCenter.TRANSPORT;
  constructor(private expenses: ExpensesService) {}

  // ── Categories ──
  @Get('expense-categories')
  @RequirePermission('transport', 'VIEW')
  findCategories(@CurrentUser() user: any) {
    return this.expenses.findCategories(user.schoolId, this.center);
  }

  @Post('expense-categories')
  @RequirePermission('transport', 'CREATE')
  createCategory(@CurrentUser() user: any, @Body() dto: CreateExpenseCategoryDto) {
    return this.expenses.createCategory(user.schoolId, this.center, dto);
  }

  @Patch('expense-categories/:id')
  @RequirePermission('transport', 'EDIT')
  updateCategory(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateExpenseCategoryDto) {
    return this.expenses.updateCategory(user.schoolId, this.center, id, dto);
  }

  @Delete('expense-categories/:id')
  @RequirePermission('transport', 'DELETE')
  deleteCategory(@CurrentUser() user: any, @Param('id') id: string) {
    return this.expenses.deleteCategory(user.schoolId, this.center, id);
  }

  // ── Expenses ──
  @Get('expenses')
  @RequirePermission('transport', 'VIEW')
  findExpenses(
    @CurrentUser() user: any,
    @Query('termId') termId?: string,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.expenses.findExpenses(user.schoolId, this.center, termId, categoryId);
  }

  @Post('expenses')
  @RequirePermission('transport', 'CREATE')
  createExpense(@CurrentUser() user: any, @Body() dto: CreateExpenseDto) {
    return this.expenses.createExpense(user.schoolId, this.center, dto, user.id);
  }

  @Patch('expenses/:id')
  @RequirePermission('transport', 'EDIT')
  updateExpense(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateExpenseDto) {
    return this.expenses.updateExpense(user.schoolId, this.center, id, dto);
  }

  @Delete('expenses/:id')
  @RequirePermission('transport', 'DELETE')
  deleteExpense(@CurrentUser() user: any, @Param('id') id: string) {
    return this.expenses.deleteExpense(user.schoolId, this.center, id);
  }

  // ── Summary (income vs expense for transport) ──
  @Get('expense-summary')
  @RequirePermission('transport', 'VIEW')
  getSummary(@CurrentUser() user: any, @Query('termId') termId: string) {
    return this.expenses.getStreamSummary(user.schoolId, this.center, termId);
  }
}
