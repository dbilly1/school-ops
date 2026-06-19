import { IsBoolean, IsString, IsOptional, IsArray, ValidateNested, IsInt, IsNumber, Min, Max, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { AssessmentCategory, ReportCardLayout } from '@prisma/client';

export class CustomSectionDto {
  @IsString()
  label!: string;

  @IsInt()
  position!: number;
}

export class CategoryWeightDto {
  @IsEnum(AssessmentCategory)
  category!: AssessmentCategory;

  @IsNumber()
  @Min(0)
  weight!: number;
}

export class UpdateCategoryWeightsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CategoryWeightDto)
  weights!: CategoryWeightDto[];
}

export class UpdateReportCardConfigDto {
  @IsBoolean()
  @IsOptional()
  showRawScore?: boolean;

  @IsBoolean()
  @IsOptional()
  showGradeLabel?: boolean;

  @IsBoolean()
  @IsOptional()
  showAttendanceSummary?: boolean;

  @IsBoolean()
  @IsOptional()
  showBehaviourScores?: boolean;

  @IsBoolean()
  @IsOptional()
  showTeacherComments?: boolean;

  @IsBoolean()
  @IsOptional()
  showPrincipalComments?: boolean;

  @IsBoolean()
  @IsOptional()
  showNextTermInfo?: boolean;

  @IsBoolean()
  @IsOptional()
  showPosition?: boolean;

  @IsEnum(ReportCardLayout)
  @IsOptional()
  reportCardLayout?: ReportCardLayout;

  @IsBoolean()
  @IsOptional()
  showAssessmentScale?: boolean;

  @IsBoolean()
  @IsOptional()
  showMetricsTable?: boolean;

  // Class-score (SBA) vs end-of-term-exam split. Should sum to 100.
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  sbaWeight?: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  examWeight?: number;

  @IsString()
  @IsOptional()
  footerText?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomSectionDto)
  @IsOptional()
  customSections?: CustomSectionDto[];
}

// ── Assessment scale (Holistic Development) configuration ──────────────────────

export class ProficiencyLevelDto {
  @IsString()
  code!: string;

  @IsString()
  label!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  @IsOptional()
  sequence?: number;
}

export class HolisticSkillDto {
  @IsString()
  label!: string;

  @IsString()
  @IsOptional()
  groupLabel?: string;

  @IsInt()
  @IsOptional()
  sequence?: number;
}

export class UpdateAssessmentScaleDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProficiencyLevelDto)
  levels!: ProficiencyLevelDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HolisticSkillDto)
  skills!: HolisticSkillDto[];
}
