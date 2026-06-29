import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CostCenter, StaffRole } from '@prisma/client';
import { ExpensesService } from './expenses.service';
import {
  CreateExpenseCategoryDto, UpdateExpenseCategoryDto,
  CreateExpenseDto, UpdateExpenseDto, SaveBudgetsDto, SetExpenseModeDto,
} from './dto/expenses.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { StaffRolesGuard } from '../../auth/guards/staff-roles.guard';
import { RequireStaffRole } from '../../auth/decorators/staff-roles.decorator';
import { PermissionsGuard } from '../../permissions/permissions.guard';
import { RequirePermission } from '../../permissions/decorators/require-permission.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

// General (school-wide) expenses — the GENERAL cost center. Feeding and
// transport expenses live on their own controllers under their own
// permissions; this page only ever touches GENERAL, except that in UNIFIED
// mode the listing/summary pool the other streams in read-only.
//
// Expense management is a grantable sub-feature of finance (like feeding's
// fee_collection): Owner/Admin have it by default, accountants only when granted.
@ApiTags('Expenses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, StaffRolesGuard, PermissionsGuard)
@Controller('school/finance')
export class ExpensesController {
  constructor(private expenses: ExpensesService) {}

  // ── Operating mode ──
  // Readable by anyone who can view expenses (so the page reflects the true
  // mode); only school leadership may change it.
  @Get('expense-mode')
  @RequirePermission('finance', 'VIEW', 'expense_management')
  async getMode(@CurrentUser() user: any) {
    return { mode: await this.expenses.getExpenseMode(user.schoolId) };
  }

  @Patch('expense-mode')
  @RequireStaffRole(StaffRole.SCHOOL_OWNER, StaffRole.SCHOOL_ADMIN)
  setMode(@CurrentUser() user: any, @Body() dto: SetExpenseModeDto) {
    return this.expenses.setExpenseMode(user.schoolId, dto.mode);
  }

  // ── Categories ──
  @Get('expense-categories')
  @RequirePermission('finance', 'VIEW', 'expense_management')
  findCategories(@CurrentUser() user: any) {
    return this.expenses.findCategories(user.schoolId, CostCenter.GENERAL);
  }

  @Post('expense-categories')
  @RequirePermission('finance', 'CREATE', 'expense_management')
  createCategory(@CurrentUser() user: any, @Body() dto: CreateExpenseCategoryDto) {
    return this.expenses.createCategory(user.schoolId, CostCenter.GENERAL, dto);
  }

  @Patch('expense-categories/:id')
  @RequirePermission('finance', 'EDIT', 'expense_management')
  updateCategory(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateExpenseCategoryDto) {
    return this.expenses.updateCategory(user.schoolId, CostCenter.GENERAL, id, dto);
  }

  @Delete('expense-categories/:id')
  @RequirePermission('finance', 'DELETE', 'expense_management')
  deleteCategory(@CurrentUser() user: any, @Param('id') id: string) {
    return this.expenses.deleteCategory(user.schoolId, CostCenter.GENERAL, id);
  }

  // ── Expenses ──
  @Get('expenses')
  @RequirePermission('finance', 'VIEW', 'expense_management')
  findExpenses(
    @CurrentUser() user: any,
    @Query('termId') termId?: string,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.expenses.findGeneralExpenses(user.schoolId, termId, categoryId);
  }

  @Post('expenses')
  @RequirePermission('finance', 'CREATE', 'expense_management')
  createExpense(@CurrentUser() user: any, @Body() dto: CreateExpenseDto) {
    return this.expenses.createExpense(user.schoolId, CostCenter.GENERAL, dto, user.id);
  }

  @Patch('expenses/:id')
  @RequirePermission('finance', 'EDIT', 'expense_management')
  updateExpense(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateExpenseDto) {
    return this.expenses.updateExpense(user.schoolId, CostCenter.GENERAL, id, dto);
  }

  @Delete('expenses/:id')
  @RequirePermission('finance', 'DELETE', 'expense_management')
  deleteExpense(@CurrentUser() user: any, @Param('id') id: string) {
    return this.expenses.deleteExpense(user.schoolId, CostCenter.GENERAL, id);
  }

  // ── Budgets ──
  @Get('expense-budgets')
  @RequirePermission('finance', 'VIEW', 'expense_management')
  findBudgets(@CurrentUser() user: any, @Query('termId') termId: string) {
    return this.expenses.findBudgets(user.schoolId, termId);
  }

  @Post('expense-budgets')
  @RequirePermission('finance', 'EDIT', 'expense_management')
  saveBudgets(@CurrentUser() user: any, @Body() dto: SaveBudgetsDto) {
    return this.expenses.saveBudgets(user.schoolId, dto);
  }

  // ── Summary ──
  @Get('summary')
  @RequirePermission('finance', 'VIEW', 'expense_management')
  getSummary(@CurrentUser() user: any, @Query('termId') termId: string) {
    return this.expenses.getSummary(user.schoolId, termId);
  }
}
