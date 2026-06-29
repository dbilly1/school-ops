import { IsString, IsNumber, IsOptional, IsPositive, IsDateString, IsIn, IsBoolean, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class BulkFeeStructureEntry {
  @IsString()
  gradeLevelId!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;
}

export class MatrixFeeCell {
  @IsString()
  gradeLevelId!: string;

  @IsString()
  studentCategoryId!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;
}

export class SaveFeeMatrixDto {
  @IsString()
  termId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MatrixFeeCell)
  cells!: MatrixFeeCell[];
}

export class BulkCreateFeeStructuresDto {
  @IsString()
  studentCategoryId!: string;

  @IsString()
  termId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkFeeStructureEntry)
  entries!: BulkFeeStructureEntry[];
}

export class CreateFeeStructureDto {
  @IsString()
  gradeLevelId!: string;

  @IsString()
  studentCategoryId!: string;

  @IsString()
  termId!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsString()
  @IsOptional()
  description?: string;
}

export class CreateInvoiceDto {
  @IsString()
  studentId!: string;

  @IsString()
  termId!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class RecordPaymentDto {
  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsDateString()
  paymentDate!: string;

  @IsString()
  @IsOptional()
  method?: string;

  @IsString()
  @IsOptional()
  reference?: string;

  @IsString()
  @IsOptional()
  paidBy?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class AssignStudentCategoryDto {
  @IsString()
  studentCategoryId!: string;
}

export class CreateStudentDiscountDto {
  @IsString()
  studentId!: string;

  // null/omitted = whole invoice; else scoped to one fee component.
  @IsString()
  @IsOptional()
  feeComponentId?: string | null;

  @IsIn(['DISCOUNT', 'SCHOLARSHIP', 'BURSARY'])
  @IsOptional()
  kind?: 'DISCOUNT' | 'SCHOLARSHIP' | 'BURSARY';

  @IsIn(['PERCENT', 'FIXED'])
  type!: 'PERCENT' | 'FIXED';

  @IsNumber()
  @IsPositive()
  value!: number;

  @IsString()
  @IsOptional()
  label?: string;

  @IsIn(['PER_TERM', 'PER_YEAR', 'ONE_TIME'])
  @IsOptional()
  frequency?: 'PER_TERM' | 'PER_YEAR' | 'ONE_TIME';
}

export class UpdateStudentDiscountDto {
  @IsString()
  @IsOptional()
  feeComponentId?: string | null;

  @IsIn(['DISCOUNT', 'SCHOLARSHIP', 'BURSARY'])
  @IsOptional()
  kind?: 'DISCOUNT' | 'SCHOLARSHIP' | 'BURSARY';

  @IsIn(['PERCENT', 'FIXED'])
  @IsOptional()
  type?: 'PERCENT' | 'FIXED';

  @IsNumber()
  @IsPositive()
  @IsOptional()
  value?: number;

  @IsString()
  @IsOptional()
  label?: string;

  @IsIn(['PER_TERM', 'PER_YEAR', 'ONE_TIME'])
  @IsOptional()
  frequency?: 'PER_TERM' | 'PER_YEAR' | 'ONE_TIME';

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
