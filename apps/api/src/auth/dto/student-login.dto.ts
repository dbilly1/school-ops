import { IsString, MinLength } from 'class-validator';

export class StudentLoginDto {
  @IsString()
  studentId!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}
