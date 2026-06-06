import { IsString, IsEmail, MinLength, IsOptional } from 'class-validator';

export class RegisterSchoolDto {
  // School info
  @IsString()
  schoolName!: string;

  @IsString()
  country!: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  // School Owner account
  @IsString()
  ownerFirstName!: string;

  @IsString()
  ownerLastName!: string;

  @IsEmail()
  ownerEmail!: string;

  @IsString()
  @MinLength(8)
  ownerPassword!: string;
}
