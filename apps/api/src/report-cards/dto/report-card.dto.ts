import { IsString, IsArray, IsOptional, IsObject } from 'class-validator';

export class GenerateReportCardsDto {
  @IsString()
  termId!: string;

  @IsString()
  classId!: string;
}

export class PublishReportCardsDto {
  @IsString()
  termId!: string;

  @IsString()
  classId!: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  studentIds?: string[];
}

export class UpdateReportCardDto {
  @IsString()
  @IsOptional()
  attitudes?: string;

  @IsString()
  @IsOptional()
  interests?: string;

  @IsString()
  @IsOptional()
  conduct?: string;

  @IsString()
  @IsOptional()
  teacherRemarks?: string;

  @IsString()
  @IsOptional()
  headTeacherRemarks?: string;

  @IsString()
  @IsOptional()
  promotedTo?: string;

  // Holistic Development ratings: { [skillId]: levelCode }.
  @IsObject()
  @IsOptional()
  holistic?: Record<string, string>;
}
