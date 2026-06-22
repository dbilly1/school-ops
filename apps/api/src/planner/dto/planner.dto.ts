import { IsString, IsOptional, IsDateString, IsEnum, IsInt } from 'class-validator';
import { PlannerStatus } from '@prisma/client';

export class CreatePlannerEntryDto {
  @IsString()
  title!: string;

  // The day this entry is planned for (date-only; time is ignored).
  @IsDateString()
  date!: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  color?: string;

  @IsString()
  @IsOptional()
  classId?: string;

  @IsString()
  @IsOptional()
  subjectId?: string;

  @IsEnum(PlannerStatus)
  @IsOptional()
  status?: PlannerStatus;

  @IsInt()
  @IsOptional()
  position?: number;
}

export class UpdatePlannerEntryDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsDateString()
  @IsOptional()
  date?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  color?: string;

  // Empty string clears the tag (set the FK to null).
  @IsString()
  @IsOptional()
  classId?: string;

  @IsString()
  @IsOptional()
  subjectId?: string;

  @IsEnum(PlannerStatus)
  @IsOptional()
  status?: PlannerStatus;

  @IsInt()
  @IsOptional()
  position?: number;
}
