import { IsString, IsArray, IsOptional, IsEnum, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export enum ProgressionAction {
  PROMOTE = 'PROMOTE',
  REPEAT = 'REPEAT',
  SKIP = 'SKIP',
}

export class StudentProgressionOverrideDto {
  @IsString()
  studentId!: string;

  @IsEnum(ProgressionAction)
  action!: ProgressionAction;

  @IsString()
  @IsOptional()
  targetClassId?: string;
}

export class ExecuteProgressionDto {
  @IsString()
  fromAcademicYearId!: string;

  @IsString()
  toAcademicYearId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StudentProgressionOverrideDto)
  @IsOptional()
  overrides?: StudentProgressionOverrideDto[];
}
