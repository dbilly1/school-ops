import { IsString, IsOptional, IsEnum, IsArray, ArrayNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';
import { EducationLevelType } from '@prisma/client';

export class CreateCurriculumResourceDto {
  // Sent as a comma-separated string over multipart/form-data; coerce to an array
  // so a single upload can cover several level bands.
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? value.split(',').map((s) => s.trim()).filter(Boolean)
        : value,
  )
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(EducationLevelType, { each: true })
  levelTypes!: EducationLevelType[];

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
