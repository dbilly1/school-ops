import { IsArray, IsOptional, IsString, ValidateNested, ArrayMaxSize, ArrayNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * One spreadsheet row. Every field is an optional string — row-level validation
 * happens in the service so we can return per-row errors instead of rejecting
 * the whole batch with a 400. The client normalises header names and stringifies
 * cells (numbers/dates) before sending.
 */
export class ImportStudentRowDto {
  @IsString() @IsOptional() firstName?: string;
  @IsString() @IsOptional() lastName?: string;
  @IsString() @IsOptional() gender?: string;
  @IsString() @IsOptional() dateOfBirth?: string;
  @IsString() @IsOptional() address?: string;
  /** Class name as typed in the sheet; resolved to a classId by name. */
  @IsString() @IsOptional() className?: string;
  /** Fee category name; resolved to a studentCategoryId by name. */
  @IsString() @IsOptional() categoryName?: string;
  @IsString() @IsOptional() guardianName?: string;
  @IsString() @IsOptional() guardianPhone?: string;
  @IsString() @IsOptional() guardianRelationship?: string;
}

// Cap the batch so a runaway upload can't tie up the request. Schools import a
// roster at a time; 2000 covers even large basic schools in one go.
const MAX_IMPORT_ROWS = 2000;

export class ImportStudentsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_IMPORT_ROWS)
  @ValidateNested({ each: true })
  @Type(() => ImportStudentRowDto)
  rows!: ImportStudentRowDto[];
}
