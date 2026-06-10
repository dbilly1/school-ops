import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateMeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'First name cannot be empty' })
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Last name cannot be empty' })
  lastName?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  phone?: string | null;
}
