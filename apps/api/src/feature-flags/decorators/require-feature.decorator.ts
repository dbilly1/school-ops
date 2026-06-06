import { SetMetadata } from '@nestjs/common';

export const FEATURE_KEY = 'required_feature';

export interface FeatureRequirement {
  featureKey: string;
  subFeatureKey?: string;
}

export const RequireFeature = (featureKey: string, subFeatureKey?: string) =>
  SetMetadata(FEATURE_KEY, { featureKey, subFeatureKey });
