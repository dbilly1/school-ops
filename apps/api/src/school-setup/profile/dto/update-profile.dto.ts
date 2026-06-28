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

  // Free-text payment instructions printed on fee invoices (bank details,
  // mobile money, deadlines). Empty string clears it.
  @IsString()
  @IsOptional()
  @MaxLength(4000)
  feePaymentGuidelines?: string;
}
