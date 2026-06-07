import { IsString, IsOptional, IsDateString, IsBoolean, IsObject, IsNotEmpty, IsArray, ArrayNotEmpty } from 'class-validator';

export class CreateStudentDto {
  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @IsString()
  @IsOptional()
  gender?: string;

  @IsDateString()
  @IsOptional()
  dateOfBirth?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  address?: string;

  /** Assign to a class immediately on creation */
  @IsString()
  @IsOptional()
  classId?: string;

  /** Fee category (determines which fee structure applies) */
  @IsString()
  @IsOptional()
  studentCategoryId?: string;
}

export class UpdateStudentDto {
  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsDateString()
  @IsOptional()
  dateOfBirth?: string;

  @IsString()
  @IsOptional()
  gender?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  address?: string;

  /** Fee category (determines which fee structure applies). Pass empty string to clear. */
  @IsString()
  @IsOptional()
  studentCategoryId?: string;

  @IsString()
  @IsOptional()
  medicalNotes?: string;

  @IsObject()
  @IsOptional()
  emergencyContacts?: Record<string, any>;

  @IsObject()
  @IsOptional()
  customFields?: Record<string, any>;
}

export class AddGuardianDto {
  @IsString()
  name!: string;

  @IsString()
  relationship!: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsBoolean()
  @IsOptional()
  isPrimary?: boolean;
}

export class AssignClassDto {
  @IsString()
  classId!: string;

  @IsString()
  @IsOptional()
  academicYearId?: string;
}

export class BulkAssignCategoryDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  studentIds!: string[];

  /** Category to assign. Omit / empty string to clear the category. */
  @IsString()
  @IsOptional()
  studentCategoryId?: string;
}
