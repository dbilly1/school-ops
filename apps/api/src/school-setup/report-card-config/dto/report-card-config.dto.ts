import { IsBoolean, IsString, IsOptional, IsArray, ValidateNested, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class CustomSectionDto {
  @IsString()
  label!: string;

  @IsInt()
  position!: number;
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

  @IsString()
  @IsOptional()
  footerText?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomSectionDto)
  @IsOptional()
  customSections?: CustomSectionDto[];
}
