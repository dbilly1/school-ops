import { IsString, IsOptional, IsEnum, IsInt, Min } from 'class-validator';
import { EducationLevelType } from '@prisma/client';

export class CreateCurriculumSubjectDto {
  @IsEnum(EducationLevelType)
  levelType!: EducationLevelType;

  @IsString()
  name!: string;

  @IsString()
  @IsOptional()
  code?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  sequence?: number;
}

export class UpdateCurriculumSubjectDto {
  @IsEnum(EducationLevelType)
  @IsOptional()
  levelType?: EducationLevelType;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  code?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  sequence?: number;
}
