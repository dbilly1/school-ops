import { IsString, IsInt, IsArray, IsOptional, IsEnum, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { SlotType } from '@prisma/client';

export class TimetableBreakDto {
  @IsInt()
  @Min(1)
  afterPeriod!: number;

  @IsInt()
  @Min(1)
  durationMinutes!: number;

  @IsString()
  @IsOptional()
  label?: string;
}

export class CreateTimetableConfigDto {
  @IsString()
  termId!: string;

  @IsInt()
  @Min(1)
  periodsPerDay!: number;

  @IsInt()
  @Min(10)
  periodDurationMinutes!: number;

  @IsArray()
  @IsString({ each: true })
  schoolDays!: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TimetableBreakDto)
  @IsOptional()
  breaks?: TimetableBreakDto[];
}

export class UpdateTimetableConfigDto {
  @IsInt()
  @Min(1)
  periodsPerDay!: number;

  @IsInt()
  @Min(10)
  periodDurationMinutes!: number;

  @IsArray()
  @IsString({ each: true })
  schoolDays!: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TimetableBreakDto)
  @IsOptional()
  breaks?: TimetableBreakDto[];
}

export class UpsertSlotDto {
  @IsString()
  classId!: string;

  @IsString()
  day!: string;

  @IsInt()
  @Min(1)
  periodNumber!: number;

  @IsEnum(SlotType)
  @IsOptional()
  slotType?: SlotType;

  @IsString()
  @IsOptional()
  subjectId?: string;

  @IsString()
  @IsOptional()
  teacherId?: string;
}
