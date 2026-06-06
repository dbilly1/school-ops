import { IsString, IsArray, IsOptional } from 'class-validator';

export class GenerateReportCardsDto {
  @IsString()
  termId!: string;

  @IsString()
  classId!: string;
}

export class PublishReportCardsDto {
  @IsString()
  termId!: string;

  @IsString()
  classId!: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  studentIds?: string[];
}
