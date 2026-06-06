import { IsEmail, IsString, IsArray, IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { StaffRole, PermissionAction } from '@prisma/client';

export class InviteUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;

  @IsArray()
  @IsEnum(StaffRole, { each: true })
  roles!: StaffRole[];
}

export class AssignRolesDto {
  @IsArray()
  @IsEnum(StaffRole, { each: true })
  roles!: StaffRole[];
}

export class RolePermissionOverrideDto {
  @IsEnum(StaffRole)
  role!: StaffRole;

  @IsString()
  featureKey!: string;

  @IsString()
  @IsOptional()
  subFeatureKey?: string;

  @IsEnum(PermissionAction)
  action!: PermissionAction;

  @IsBoolean()
  granted!: boolean;
}

export class UserPermissionOverrideDto {
  @IsString()
  featureKey!: string;

  @IsString()
  @IsOptional()
  subFeatureKey?: string;

  @IsEnum(PermissionAction)
  action!: PermissionAction;

  @IsBoolean()
  granted!: boolean;
}
