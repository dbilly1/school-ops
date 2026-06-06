import { IsString, IsInt, Min, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateGradeLevelDto {
  @IsString()
  name!: string;

  @IsInt()
  @Min(1)
  sequence!: number;
}

export class CreateClassDto {
  @IsString()
  gradeLevelId!: string;

  @IsString()
  name!: string;
}

export class BulkGradeLevelItem {
  @IsString()
  name!: string;

  @IsInt()
  @Min(1)
  sequence!: number;

  /**
   * Sub-class labels for this grade level (e.g. ['A', 'B']).
   * Empty array means the grade itself is the single class.
   */
  @IsArray()
  @IsString({ each: true })
  classes!: string[];
}

export class BulkCreateGradeLevelsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkGradeLevelItem)
  levels!: BulkGradeLevelItem[];
}

export class UpdateGradeLevelDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  sequence?: number;
}
