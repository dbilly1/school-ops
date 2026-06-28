import {
  IsString, IsNumber, IsOptional, IsBoolean, IsInt, IsArray, IsEnum, Min, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FeeBillingFrequency } from '@prisma/client';

// ── Fee component catalog ─────────────────────────────────────────────────

export class CreateFeeComponentDto {
  @IsString()
  name!: string;

  @IsEnum(FeeBillingFrequency)
  @IsOptional()
  billingFrequency?: FeeBillingFrequency;
}

export class UpdateFeeComponentDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsInt()
  @IsOptional()
  sequence?: number;

  @IsEnum(FeeBillingFrequency)
  @IsOptional()
  billingFrequency?: FeeBillingFrequency;

  @IsBoolean()
  @IsOptional()
  isArchived?: boolean;
}

// ── Fee items (per category × term) ───────────────────────────────────────

export class FeeItemOverrideInput {
  @IsString()
  gradeLevelId!: string;

  @IsNumber()
  @Min(0)
  amount!: number;
}

export class FeeItemInput {
  @IsString()
  feeComponentId!: string;

  @IsNumber()
  @Min(0)
  defaultAmount!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FeeItemOverrideInput)
  overrides!: FeeItemOverrideInput[];
}

export class SaveFeeItemsDto {
  @IsString()
  studentCategoryId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FeeItemInput)
  items!: FeeItemInput[];
}
