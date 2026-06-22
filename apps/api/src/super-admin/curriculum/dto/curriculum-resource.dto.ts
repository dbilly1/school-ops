import { IsString, IsOptional, IsEnum } from 'class-validator';
import { EducationLevelType } from '@prisma/client';

export class CreateCurriculumResourceDto {
  @IsEnum(EducationLevelType)
  levelType!: EducationLevelType;

  @IsString()
  subjectName!: string;

  @IsString()
  title!: string;

  @IsString()
  @IsOptional()
  description?: string;
}

// A multipart file as populated by multer (typed locally to avoid a hard
// dependency on @types/multer).
export interface UploadedFileLike {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}
