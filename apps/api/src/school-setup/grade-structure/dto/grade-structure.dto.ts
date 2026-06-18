import { IsString, IsInt, Min, IsOptional, IsArray, ValidateNested, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { EducationLevelType } from '@prisma/client';

export class CreateGradeLevelDto {
  @IsString()
  name!: string;

  @IsInt()
  @Min(1)
  sequence!: number;

  @IsEnum(EducationLevelType)
  @IsOptional()
  levelType?: EducationLevelType;
}

export class CreateClassDto {
  @IsString()
  gradeLevelId!: string;

  @IsString()
  name!: string;
}

export class BulkGradeLevelItem {
  @IsString()
  name!: string;

  @IsInt()
  @Min(1)
  sequence!: number;

  @IsEnum(EducationLevelType)
  @IsOptional()
  levelType?: EducationLevelType;

  /**
   * Sub-class labels for this grade level (e.g. ['A', 'B']).
   * Empty array means the grade itself is the single class.
   */
  @IsArray()
  @IsString({ each: true })
  classes!: string[];
}

export class BulkCreateGradeLevelsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkGradeLevelItem)
  levels!: BulkGradeLevelItem[];
}

export class UpdateGradeLevelDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  sequence?: number;

  @IsEnum(EducationLevelType)
  @IsOptional()
  levelType?: EducationLevelType;
}
