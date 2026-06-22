import { IsString, IsOptional, IsEnum } from 'class-validator';
import { EducationLevelType } from '@prisma/client';

export class CreateCurriculumLinkDto {
  @IsString()
  title!: string;

  @IsString()
  url!: string;

  @IsEnum(EducationLevelType)
  @IsOptional()
  levelType?: EducationLevelType;

  @IsString()
  @IsOptional()
  subjectName?: string;

  @IsString()
  @IsOptional()
  description?: string;
}

export class UpdateCurriculumLinkDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  url?: string;

  @IsEnum(EducationLevelType)
  @IsOptional()
  levelType?: EducationLevelType;

  @IsString()
  @IsOptional()
  subjectName?: string;

  @IsString()
  @IsOptional()
  description?: string;
}
