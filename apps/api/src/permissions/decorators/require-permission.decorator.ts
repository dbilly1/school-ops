import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'required_permission';

export interface PermissionRequirement {
  featureKey: string;
  subFeatureKey?: string;
  action: 'VIEW' | 'CREATE' | 'EDIT' | 'DELETE';
}

export const RequirePermission = (
  featureKey: string,
  action: PermissionRequirement['action'],
  subFeatureKey?: string,
) => SetMetadata(PERMISSION_KEY, { featureKey, action, subFeatureKey });
