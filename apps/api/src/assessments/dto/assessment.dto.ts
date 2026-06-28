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

// One subject in a batch — its own total marks (and optional weight) so an
// English /100 and a practical /50 can go out in the same batch.
export class BatchSubjectDto {
  @IsString()
  subjectId!: string;

  @IsNumber()
  @Min(1)
  totalScore!: number;

  @IsNumber()
  @IsOptional()
  weight?: number;
}

// Create one assessment per (class × subject) in a single call. Used for
// term-wide exams (mid-term, end-of-term) that span every subject of a class.
// Combos where the subject isn't on the class's grade level are skipped, as are
// exact duplicates (same title/subject/class/term/category).
export class BatchCreateAssessmentDto {
  @IsArray()
  @IsString({ each: true })
  classIds!: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BatchSubjectDto)
  subjects!: BatchSubjectDto[];

  @IsEnum(AssessmentCategory)
  @IsOptional()
  category?: AssessmentCategory;

  @IsString()
  termId!: string;

  @IsString()
  title!: string;

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
