import { IsString, IsOptional } from 'class-validator';

export class UpsertPackageFeatureDto {
  @IsString()
  featureKey!: string;

  @IsString()
  @IsOptional()
  subFeatureKey?: string;
}
