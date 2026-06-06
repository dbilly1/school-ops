import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import {
  InviteUserDto, AssignRolesDto,
  RolePermissionOverrideDto, UserPermissionOverrideDto,
} from './dto/user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ManagementWriteGuard } from '../auth/guards/management-write.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { StaffRole } from '@prisma/client';

// Writes restricted to Owner/Admin at the guard layer; the service applies the
// finer-grained capability rules (Owner-only admin appointment, the
// adminCanManagePermissions toggle, etc.).
@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ManagementWriteGuard)
@Controller('school/users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  findAll(@CurrentUser() user: any) {
    return this.usersService.findAll(user.schoolId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.usersService.findOne(user.schoolId, id);
  }

  @Post('invite')
  invite(@CurrentUser() user: any, @Body() dto: InviteUserDto) {
    return this.usersService.invite(user.schoolId, dto, user.id);
  }

  @Delete(':id')
  deleteUser(@CurrentUser() user: any, @Param('id') id: string) {
    return this.usersService.deleteUser(user.schoolId, id, user.id);
  }

  @Patch(':id/activate')
  activate(@CurrentUser() user: any, @Param('id') id: string) {
    return this.usersService.setActive(user.schoolId, id, true, user.id);
  }

  @Patch(':id/deactivate')
  deactivate(@CurrentUser() user: any, @Param('id') id: string) {
    return this.usersService.setActive(user.schoolId, id, false, user.id);
  }

  @Patch(':id/roles')
  assignRoles(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: AssignRolesDto) {
    return this.usersService.assignRoles(user.schoolId, id, dto, user.id);
  }

  @Patch(':id/reset-password')
  resetPassword(@CurrentUser() user: any, @Param('id') id: string) {
    return this.usersService.resetPassword(user.schoolId, id, user.id);
  }

  // ── Permission overrides ──────────────────────────────────

  @Get('overrides/roles/:role')
  getRoleOverrides(@CurrentUser() user: any, @Param('role') role: StaffRole) {
    return this.usersService.getRoleOverrides(user.schoolId, role);
  }

  @Post('overrides/roles')
  upsertRoleOverride(@CurrentUser() user: any, @Body() dto: RolePermissionOverrideDto) {
    return this.usersService.upsertRoleOverride(user.schoolId, dto, user.id);
  }

  @Delete('overrides/roles')
  deleteRoleOverride(
    @CurrentUser() user: any,
    @Query('role') role: StaffRole,
    @Query('featureKey') featureKey: string,
    @Query('subFeatureKey') subFeatureKey: string,
    @Query('action') action: string,
  ) {
    return this.usersService.deleteRoleOverride(
      user.schoolId, role, featureKey,
      subFeatureKey || null, action, user.id,
    );
  }

  @Get(':id/overrides')
  getUserOverrides(@CurrentUser() user: any, @Param('id') id: string) {
    return this.usersService.getUserOverrides(user.schoolId, id);
  }

  @Post(':id/overrides')
  upsertUserOverride(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UserPermissionOverrideDto,
  ) {
    return this.usersService.upsertUserOverride(user.schoolId, id, dto, user.id);
  }

  @Delete(':id/overrides')
  deleteUserOverride(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Query('featureKey') featureKey: string,
    @Query('subFeatureKey') subFeatureKey: string,
    @Query('action') action: string,
  ) {
    return this.usersService.deleteUserOverride(
      user.schoolId, id, featureKey,
      subFeatureKey || null, action, user.id,
    );
  }
}
