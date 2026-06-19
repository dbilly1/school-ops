import { IsString, IsOptional, MaxLength } from 'class-validator';

export class UpdateSchoolProfileDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  country?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  email?: string;

  // Accepts a public URL or an inline base64 data URL (resized client-side).
  @IsString()
  @IsOptional()
  @MaxLength(5_000_000)
  logoUrl?: string;

  @IsString()
  @IsOptional()
  primaryColor?: string;
}
