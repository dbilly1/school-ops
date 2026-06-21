import { Controller, Get, Patch, Post, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { StaffService } from './staff.service';
import { UpdateStaffProfileDto, AssignClassDto, AssignSubjectDto } from './dto/staff.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StaffRolesGuard } from '../auth/guards/staff-roles.guard';
import { RequireStaffRole } from '../auth/decorators/staff-roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { StaffRole } from '@prisma/client';

// Reads are open to staff; staff-record mutations are Owner/Admin only (HR).
@ApiTags('Staff')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, StaffRolesGuard)
@Controller('school/staff')
export class StaffController {
  constructor(private staffService: StaffService) {}

  @Get('me/assignments')
  getMyAssignments(@CurrentUser() user: any) {
    return this.staffService.getMyAssignments(user.schoolId, user.id);
  }

  @Get(':userId/profile')
  @RequireStaffRole(StaffRole.SCHOOL_OWNER, StaffRole.SCHOOL_ADMIN, StaffRole.HEADMASTER)
  getProfile(@CurrentUser() user: any, @Param('userId') userId: string) {
    return this.staffService.getProfile(user.schoolId, userId);
  }

  @Patch(':userId/profile')
  @RequireStaffRole(StaffRole.SCHOOL_OWNER, StaffRole.SCHOOL_ADMIN, StaffRole.HEADMASTER)
  updateProfile(
    @CurrentUser() user: any,
    @Param('userId') userId: string,
    @Body() dto: UpdateStaffProfileDto,
  ) {
    return this.staffService.updateProfile(user.schoolId, userId, dto);
  }

  @Post(':userId/class-assignments')
  @RequireStaffRole(StaffRole.SCHOOL_OWNER, StaffRole.SCHOOL_ADMIN, StaffRole.HEADMASTER)
  assignClass(@CurrentUser() user: any, @Param('userId') userId: string, @Body() dto: AssignClassDto) {
    return this.staffService.assignClass(user.schoolId, userId, dto);
  }

  @Delete(':userId/class-assignments/:classId')
  @RequireStaffRole(StaffRole.SCHOOL_OWNER, StaffRole.SCHOOL_ADMIN, StaffRole.HEADMASTER)
  removeClassAssignment(
    @CurrentUser() user: any,
    @Param('userId') userId: string,
    @Param('classId') classId: string,
  ) {
    return this.staffService.removeClassAssignment(user.schoolId, userId, classId);
  }

  @Post(':userId/subject-assignments')
  @RequireStaffRole(StaffRole.SCHOOL_OWNER, StaffRole.SCHOOL_ADMIN, StaffRole.HEADMASTER)
  assignSubject(@CurrentUser() user: any, @Param('userId') userId: string, @Body() dto: AssignSubjectDto) {
    return this.staffService.assignSubject(user.schoolId, userId, dto);
  }

  @Delete(':userId/subject-assignments/:assignmentId')
  @RequireStaffRole(StaffRole.SCHOOL_OWNER, StaffRole.SCHOOL_ADMIN, StaffRole.HEADMASTER)
  removeSubjectAssignment(
    @CurrentUser() user: any,
    @Param('userId') userId: string,
    @Param('assignmentId') assignmentId: string,
  ) {
    return this.staffService.removeSubjectAssignment(user.schoolId, userId, assignmentId);
  }

  @Get('teachers/for-subject/:subjectId')
  findTeachersForSubject(@CurrentUser() user: any, @Param('subjectId') subjectId: string) {
    return this.staffService.findTeachersForSubject(user.schoolId, subjectId);
  }
}
