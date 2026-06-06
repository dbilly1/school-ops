import { IsString, IsOptional, IsDateString, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class QualificationDto {
  @IsString()
  title!: string;

  @IsString()
  @IsOptional()
  institution?: string;

  @IsOptional()
  yearObtained?: number;
}

export class UpdateStaffProfileDto {
  @IsString()
  @IsOptional()
  designation?: string;

  @IsDateString()
  @IsOptional()
  dateJoined?: string;

  @IsString()
  @IsOptional()
  employmentType?: string;

  @IsDateString()
  @IsOptional()
  dateOfBirth?: string;

  @IsString()
  @IsOptional()
  gender?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsOptional()
  emergencyContact?: Record<string, any>;

  @IsOptional()
  customFields?: Record<string, any>;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QualificationDto)
  @IsOptional()
  qualifications?: QualificationDto[];
}

export class AssignClassDto {
  @IsString()
  classId!: string;
}

export class AssignSubjectDto {
  @IsString()
  subjectId!: string;

  @IsString()
  classId!: string;
}
