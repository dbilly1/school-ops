import { IsString, IsDateString, IsBoolean, IsOptional, IsInt, Min, Max, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateTermDto {
  @IsString()
  name!: string;

  @IsInt()
  @Min(1)
  sequence!: number;

  @IsDateString()
  @IsOptional()
  startDate?: string | null;

  @IsDateString()
  @IsOptional()
  endDate?: string | null;
}

export class CreateAcademicYearDto {
  @IsString()
  name!: string;

  @IsDateString()
  @IsOptional()
  startDate?: string | null;

  @IsDateString()
  @IsOptional()
  endDate?: string | null;

  @IsInt()
  @Min(1)
  @Max(6)
  @IsOptional()
  numberOfTerms?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTermDto)
  @IsOptional()
  terms?: CreateTermDto[];
}

export class UpdateTermDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;
}
