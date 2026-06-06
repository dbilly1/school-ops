import { IsString, IsNumber, IsOptional, IsPositive, IsDateString, IsEnum, IsArray, ValidateNested } from 'class-validator';
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
  notes?: string;
}

export class AssignStudentCategoryDto {
  @IsString()
  studentCategoryId!: string;
}
