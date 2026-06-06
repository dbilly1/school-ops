import { IsEnum, IsString, IsOptional, IsBoolean, IsDateString } from 'class-validator';
import { SubscriptionState, GrantType } from '@prisma/client';

export class UpdateSubscriptionDto {
  @IsEnum(SubscriptionState)
  state!: SubscriptionState;
}

export class GrantFeatureDto {
  @IsString()
  featureKey!: string;

  @IsString()
  @IsOptional()
  subFeatureKey?: string;

  @IsEnum(GrantType)
  grantType!: GrantType;

  @IsDateString()
  @IsOptional()
  expiresAt?: string;
}
