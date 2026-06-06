import { IsBoolean, IsString, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class SetSubFeatureDto {
  @IsBoolean()
  enabled!: boolean;
}

export class BulkSubFeatureItem {
  @IsString()
  subFeatureKey!: string;

  @IsBoolean()
  enabled!: boolean;
}

export class BulkFeatureItem {
  @IsString()
  featureKey!: string;

  @IsBoolean()
  active!: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkSubFeatureItem)
  subFeatures!: BulkSubFeatureItem[];
}

export class BulkConfigureFeaturesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkFeatureItem)
  features!: BulkFeatureItem[];
}
