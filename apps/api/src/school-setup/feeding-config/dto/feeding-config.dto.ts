import { IsEnum, IsNumber, IsOptional, IsArray, ValidateNested, IsString, IsDateString, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { RateModeType } from '@prisma/client';

export class ClassRateDto {
  @IsString()
  gradeLevelId!: string;

  @IsNumber()
  dailyRate!: number;
}

export class CreateFeedingConfigDto {
  @IsEnum(RateModeType)
  rateMode!: RateModeType;

  @IsNumber()
  @IsOptional()
  flatRate?: number;

  @IsDateString()
  effectiveFrom!: string;

  // When true, feeding is optional and students can be exempted.
  @IsBoolean()
  @IsOptional()
  optOutAllowed?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClassRateDto)
  @IsOptional()
  classRates?: ClassRateDto[];
}
