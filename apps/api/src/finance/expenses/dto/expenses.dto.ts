import { IsString, IsNumber, IsOptional, IsPositive, IsDateString, IsBoolean, IsArray, ValidateNested, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { ExpenseMode } from '@prisma/client';

// ── Operating mode ────────────────────────────────────────

export class SetExpenseModeDto {
  @IsEnum(ExpenseMode)
  mode!: ExpenseMode;
}

// ── Categories ────────────────────────────────────────────

export class CreateExpenseCategoryDto {
  @IsString()
  name!: string;
}

export class UpdateExpenseCategoryDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsBoolean()
  @IsOptional()
  isArchived?: boolean;
}

// ── Expenses ──────────────────────────────────────────────

export class CreateExpenseDto {
  @IsString()
  categoryId!: string;

  @IsString()
  termId!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsDateString()
  expenseDate!: string;

  @IsString()
  @IsOptional()
  payee?: string;

  @IsString()
  @IsOptional()
  method?: string;

  @IsString()
  @IsOptional()
  reference?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateExpenseDto {
  @IsString()
  @IsOptional()
  categoryId?: string;

  @IsString()
  @IsOptional()
  termId?: string;

  @IsNumber()
  @IsPositive()
  @IsOptional()
  amount?: number;

  @IsDateString()
  @IsOptional()
  expenseDate?: string;

  @IsString()
  @IsOptional()
  payee?: string;

  @IsString()
  @IsOptional()
  method?: string;

  @IsString()
  @IsOptional()
  reference?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

// ── Budgets ───────────────────────────────────────────────

export class BudgetCell {
  @IsString()
  categoryId!: string;

  @IsNumber()
  amount!: number;
}

export class SaveBudgetsDto {
  @IsString()
  termId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BudgetCell)
  cells!: BudgetCell[];
}
