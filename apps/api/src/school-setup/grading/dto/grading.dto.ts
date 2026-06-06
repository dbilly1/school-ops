import { IsEnum, IsNumber, IsString, IsOptional, IsArray, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { GradeScaleType } from '@prisma/client';

export class GradingBandDto {
  @IsString()
  label!: string;

  @IsNumber()
  @Min(0)
  minScore!: number;

  @IsNumber()
  maxScore!: number;

  @IsNumber()
  @IsOptional()
  gpaValue?: number;

  @IsString()
  @IsOptional()
  remark?: string;
}

export class UpdateGradingBandsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GradingBandDto)
  bands!: GradingBandDto[];
}

export class CreateGradingScaleDto {
  @IsEnum(GradeScaleType)
  scaleType!: GradeScaleType;

  @IsNumber()
  @IsOptional()
  passmark?: number;

  @IsNumber()
  @IsOptional()
  gpaMax?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GradingBandDto)
  bands!: GradingBandDto[];
}
