import { IsString, IsEnum, IsOptional, IsBoolean, IsInt, IsObject } from 'class-validator';
import { AdmissionStage } from '@prisma/client';

export class AdmissionFieldConfigDto {
  @IsString()
  fieldKey!: string;

  @IsString()
  label!: string;

  @IsString()
  fieldType!: string;

  @IsBoolean()
  @IsOptional()
  isRequired?: boolean;

  @IsBoolean()
  @IsOptional()
  isHidden?: boolean;

  @IsBoolean()
  @IsOptional()
  carryToProfile?: boolean;

  @IsInt()
  position!: number;
}

export class CreateAdmissionDto {
  @IsEnum(AdmissionStage)
  @IsOptional()
  stage?: AdmissionStage;

  @IsObject()
  formData!: Record<string, any>;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateAdmissionStageDto {
  @IsEnum(AdmissionStage)
  stage!: AdmissionStage;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class AddFollowUpDto {
  @IsString()
  note!: string;

  @IsString()
  @IsOptional()
  followUpDate?: string;
}
