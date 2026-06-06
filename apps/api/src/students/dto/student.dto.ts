import { IsString, IsOptional, IsDateString, IsBoolean, IsObject, IsNotEmpty } from 'class-validator';

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
