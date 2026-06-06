import { IsString, IsArray } from 'class-validator';

export class CreateStudentCategoryDto {
  @IsString()
  name!: string;
}

export class BulkCreateCategoriesDto {
  @IsArray()
  @IsString({ each: true })
  names!: string[];
}
