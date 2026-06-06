import { Controller, Get, Patch, Post, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { StudentsService } from './students.service';
import { CreateStudentDto, UpdateStudentDto, AddGuardianDto, AssignClassDto } from './dto/student.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StaffRolesGuard } from '../auth/guards/staff-roles.guard';
import { RequireStaffRole } from '../auth/decorators/staff-roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { StaffRole } from '@prisma/client';

// Reads are open to any authenticated staff; mutations are restricted to
// School Owner / School Admin (student records are not modelled as a feature).
@ApiTags('Students')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, StaffRolesGuard)
@Controller('school/students')
export class StudentsController {
  constructor(private studentsService: StudentsService) {}

  @Post()
  @RequireStaffRole(StaffRole.SCHOOL_OWNER, StaffRole.SCHOOL_ADMIN)
  create(@CurrentUser() user: any, @Body() dto: CreateStudentDto) {
    return this.studentsService.create(user.schoolId, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: any,
    @Query('classId') classId?: string,
    @Query('academicYearId') academicYearId?: string,
  ) {
    return this.studentsService.findAll(user.schoolId, classId, academicYearId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.studentsService.findOne(user.schoolId, id);
  }

  @Patch(':id')
  @RequireStaffRole(StaffRole.SCHOOL_OWNER, StaffRole.SCHOOL_ADMIN)
  update(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateStudentDto) {
    return this.studentsService.update(user.schoolId, id, dto);
  }

  @Post(':id/guardians')
  @RequireStaffRole(StaffRole.SCHOOL_OWNER, StaffRole.SCHOOL_ADMIN)
  addGuardian(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: AddGuardianDto) {
    return this.studentsService.addGuardian(user.schoolId, id, dto);
  }

  @Delete(':id/guardians/:guardianId')
  @RequireStaffRole(StaffRole.SCHOOL_OWNER, StaffRole.SCHOOL_ADMIN)
  removeGuardian(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('guardianId') guardianId: string,
  ) {
    return this.studentsService.removeGuardian(user.schoolId, id, guardianId);
  }

  @Post(':id/class-assignment')
  @RequireStaffRole(StaffRole.SCHOOL_OWNER, StaffRole.SCHOOL_ADMIN)
  assignClass(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: AssignClassDto) {
    return this.studentsService.assignClass(user.schoolId, id, dto);
  }

  @Patch(':id/reset-portal-password')
  @RequireStaffRole(StaffRole.SCHOOL_OWNER, StaffRole.SCHOOL_ADMIN)
  resetPortalPassword(@CurrentUser() user: any, @Param('id') id: string) {
    return this.studentsService.resetPortalPassword(user.schoolId, id);
  }

  @Get(':id/performance')
  getPerformanceHistory(@CurrentUser() user: any, @Param('id') id: string) {
    return this.studentsService.getPerformanceHistory(user.schoolId, id);
  }
}
