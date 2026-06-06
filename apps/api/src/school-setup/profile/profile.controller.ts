import { Controller, Get, Patch, Post, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { IsBoolean } from 'class-validator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ProfileService } from './profile.service';
import { UpdateSchoolProfileDto } from './dto/update-profile.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ManagementWriteGuard } from '../../auth/guards/management-write.guard';
import { StaffRolesGuard } from '../../auth/guards/staff-roles.guard';
import { RequireStaffRole } from '../../auth/decorators/staff-roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { StaffRole } from '@prisma/client';

class AdminPermissionToggleDto {
  @IsBoolean()
  allowed!: boolean;
}

@ApiTags('School Setup — Profile')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ManagementWriteGuard, StaffRolesGuard)
@Controller('school/profile')
export class ProfileController {
  constructor(private profileService: ProfileService) {}

  @Get()
  getProfile(@CurrentUser() user: any) {
    return this.profileService.getProfile(user.schoolId);
  }

  @Patch()
  updateProfile(@CurrentUser() user: any, @Body() dto: UpdateSchoolProfileDto) {
    return this.profileService.updateProfile(user.schoolId, dto);
  }

  @Post('onboarding/complete')
  @HttpCode(HttpStatus.OK)
  completeOnboarding(@CurrentUser() user: any) {
    return this.profileService.completeOnboarding(user.schoolId);
  }

  /** Returns school-level settings (currently just the permission toggle) */
  @Get('settings')
  getSettings(@CurrentUser() user: any) {
    return this.profileService.getSettings(user.schoolId);
  }

  /** Owner-only: control whether Admins can manage permission overrides */
  @Patch('settings/admin-permission-toggle')
  @RequireStaffRole(StaffRole.SCHOOL_OWNER)
  setAdminPermissionToggle(@CurrentUser() user: any, @Body() dto: AdminPermissionToggleDto) {
    return this.profileService.setAdminPermissionToggle(user.schoolId, dto.allowed);
  }
}
