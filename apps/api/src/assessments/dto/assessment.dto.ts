import { IsString, IsNumber, IsOptional, IsDateString, IsArray, ValidateNested, Min, Max, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { AssessmentCategory } from '@prisma/client';

export class CreateAssessmentDto {
  @IsString()
  subjectId!: string;

  @IsString()
  @IsOptional()
  classId?: string;

  @IsEnum(AssessmentCategory)
  @IsOptional()
  category?: AssessmentCategory;

  @IsString()
  termId!: string;

  @IsString()
  title!: string;

  @IsNumber()
  @Min(1)
  totalScore!: number;

  @IsNumber()
  @IsOptional()
  weight?: number;

  @IsDateString()
  @IsOptional()
  assessmentDate?: string;
}

export class ScoreEntryDto {
  @IsString()
  studentId!: string;

  @IsNumber()
  @Min(0)
  rawScore!: number;

  @IsString()
  @IsOptional()
  remarks?: string;
}

export class BulkRecordScoresDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScoreEntryDto)
  scores!: ScoreEntryDto[];
}
