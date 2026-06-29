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

// Feeding's own expenses (ingredients, gas, …). Reuses the shared
// ExpensesService pinned to the FEEDING cost center, gated by the same
// feeding fee_collection permission as daily collection.
@ApiTags('Feeding Fees')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('school/feeding')
export class FeedingExpensesController {
  private readonly center = CostCenter.FEEDING;
  constructor(private expenses: ExpensesService) {}

  // ── Categories ──
  @Get('expense-categories')
  @RequirePermission('feeding_fees', 'VIEW', 'fee_collection')
  findCategories(@CurrentUser() user: any) {
    return this.expenses.findCategories(user.schoolId, this.center);
  }

  @Post('expense-categories')
  @RequirePermission('feeding_fees', 'CREATE', 'fee_collection')
  createCategory(@CurrentUser() user: any, @Body() dto: CreateExpenseCategoryDto) {
    return this.expenses.createCategory(user.schoolId, this.center, dto);
  }

  @Patch('expense-categories/:id')
  @RequirePermission('feeding_fees', 'EDIT', 'fee_collection')
  updateCategory(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateExpenseCategoryDto) {
    return this.expenses.updateCategory(user.schoolId, this.center, id, dto);
  }

  @Delete('expense-categories/:id')
  @RequirePermission('feeding_fees', 'DELETE', 'fee_collection')
  deleteCategory(@CurrentUser() user: any, @Param('id') id: string) {
    return this.expenses.deleteCategory(user.schoolId, this.center, id);
  }

  // ── Expenses ──
  @Get('expenses')
  @RequirePermission('feeding_fees', 'VIEW', 'fee_collection')
  findExpenses(
    @CurrentUser() user: any,
    @Query('termId') termId?: string,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.expenses.findExpenses(user.schoolId, this.center, termId, categoryId);
  }

  @Post('expenses')
  @RequirePermission('feeding_fees', 'CREATE', 'fee_collection')
  createExpense(@CurrentUser() user: any, @Body() dto: CreateExpenseDto) {
    return this.expenses.createExpense(user.schoolId, this.center, dto, user.id);
  }

  @Patch('expenses/:id')
  @RequirePermission('feeding_fees', 'EDIT', 'fee_collection')
  updateExpense(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateExpenseDto) {
    return this.expenses.updateExpense(user.schoolId, this.center, id, dto);
  }

  @Delete('expenses/:id')
  @RequirePermission('feeding_fees', 'DELETE', 'fee_collection')
  deleteExpense(@CurrentUser() user: any, @Param('id') id: string) {
    return this.expenses.deleteExpense(user.schoolId, this.center, id);
  }

  // ── Summary (income vs expense for feeding) ──
  @Get('expense-summary')
  @RequirePermission('feeding_fees', 'VIEW', 'fee_collection')
  getSummary(@CurrentUser() user: any, @Query('termId') termId: string) {
    return this.expenses.getStreamSummary(user.schoolId, this.center, termId);
  }
}
