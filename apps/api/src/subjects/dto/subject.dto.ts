import { IsString, IsOptional, IsArray } from 'class-validator';

export class CreateSubjectDto {
  @IsString()
  name!: string;

  @IsString()
  @IsOptional()
  code?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  gradeLevelIds?: string[];
}

export class UpdateSubjectDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  code?: string;
}

export class AssignSubjectToGradeLevelDto {
  @IsString()
  gradeLevelId!: string;
}
