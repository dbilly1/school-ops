import { Controller, Get, Patch, Post, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { StudentsService } from './students.service';
import { CreateStudentDto, UpdateStudentDto, AddGuardianDto, AssignClassDto, BulkAssignCategoryDto, BulkStatusDto, BulkAssignClassDto, BulkStudentIdsDto } from './dto/student.dto';
import { ImportStudentsDto } from './dto/import-student.dto';
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
  @RequireStaffRole(StaffRole.SCHOOL_OWNER, StaffRole.SCHOOL_ADMIN, StaffRole.HEADMASTER)
  create(@CurrentUser() user: any, @Body() dto: CreateStudentDto) {
    return this.studentsService.create(user.schoolId, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: any,
    @Query('classId') classId?: string,
    @Query('academicYearId') academicYearId?: string,
    @Query('studentCategoryId') studentCategoryId?: string,
    @Query('status') status?: string,
  ) {
    return this.studentsService.findAll(
      user.schoolId, user.id, user.roles ?? [], classId, academicYearId, studentCategoryId, status,
    );
  }

  @Post('bulk-category')
  @RequireStaffRole(StaffRole.SCHOOL_OWNER, StaffRole.SCHOOL_ADMIN, StaffRole.HEADMASTER)
  bulkAssignCategory(@CurrentUser() user: any, @Body() dto: BulkAssignCategoryDto) {
    return this.studentsService.bulkAssignCategory(user.schoolId, dto);
  }

  // Dry-run: validate an uploaded roster and return per-row status. Writes nothing.
  @Post('import/validate')
  @RequireStaffRole(StaffRole.SCHOOL_OWNER, StaffRole.SCHOOL_ADMIN, StaffRole.HEADMASTER)
  validateImport(@CurrentUser() user: any, @Body() dto: ImportStudentsDto) {
    return this.studentsService.validateImport(user.schoolId, dto.rows);
  }

  // Create the rows the user kept after reviewing the dry-run preview.
  @Post('import')
  @RequireStaffRole(StaffRole.SCHOOL_OWNER, StaffRole.SCHOOL_ADMIN, StaffRole.HEADMASTER)
  importStudents(@CurrentUser() user: any, @Body() dto: ImportStudentsDto) {
    return this.studentsService.importStudents(user.schoolId, dto.rows);
  }

  // Archive / restore (soft delete) selected students.
  @Post('bulk-status')
  @RequireStaffRole(StaffRole.SCHOOL_OWNER, StaffRole.SCHOOL_ADMIN, StaffRole.HEADMASTER)
  bulkSetStatus(@CurrentUser() user: any, @Body() dto: BulkStatusDto) {
    return this.studentsService.bulkSetStatus(user.schoolId, dto.studentIds, dto.status);
  }

  // Assign selected students to a class for the active (or given) year.
  @Post('bulk-assign-class')
  @RequireStaffRole(StaffRole.SCHOOL_OWNER, StaffRole.SCHOOL_ADMIN, StaffRole.HEADMASTER)
  bulkAssignClass(@CurrentUser() user: any, @Body() dto: BulkAssignClassDto) {
    return this.studentsService.bulkAssignClass(user.schoolId, dto.studentIds, dto.classId, dto.academicYearId);
  }

  // Regenerate portal passwords for selected students (returns the new passwords).
  @Post('bulk-reset-password')
  @RequireStaffRole(StaffRole.SCHOOL_OWNER, StaffRole.SCHOOL_ADMIN, StaffRole.HEADMASTER)
  bulkResetPassword(@CurrentUser() user: any, @Body() dto: BulkStudentIdsDto) {
    return this.studentsService.bulkResetPassword(user.schoolId, dto.studentIds);
  }

  // Permanently delete selected students that have no history. Owner only.
  @Post('bulk-delete')
  @RequireStaffRole(StaffRole.SCHOOL_OWNER)
  bulkDelete(@CurrentUser() user: any, @Body() dto: BulkStudentIdsDto) {
    return this.studentsService.bulkDelete(user.schoolId, dto.studentIds);
  }

  @Get(':id')
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.studentsService.findOne(user.schoolId, id, user.id, user.roles ?? []);
  }

  @Patch(':id')
  @RequireStaffRole(StaffRole.SCHOOL_OWNER, StaffRole.SCHOOL_ADMIN, StaffRole.HEADMASTER)
  update(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateStudentDto) {
    return this.studentsService.update(user.schoolId, id, dto);
  }

  @Post(':id/guardians')
  @RequireStaffRole(StaffRole.SCHOOL_OWNER, StaffRole.SCHOOL_ADMIN, StaffRole.HEADMASTER)
  addGuardian(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: AddGuardianDto) {
    return this.studentsService.addGuardian(user.schoolId, id, dto);
  }

  @Delete(':id/guardians/:guardianId')
  @RequireStaffRole(StaffRole.SCHOOL_OWNER, StaffRole.SCHOOL_ADMIN, StaffRole.HEADMASTER)
  removeGuardian(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('guardianId') guardianId: string,
  ) {
    return this.studentsService.removeGuardian(user.schoolId, id, guardianId);
  }

  @Post(':id/class-assignment')
  @RequireStaffRole(StaffRole.SCHOOL_OWNER, StaffRole.SCHOOL_ADMIN, StaffRole.HEADMASTER)
  assignClass(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: AssignClassDto) {
    return this.studentsService.assignClass(user.schoolId, id, dto);
  }

  @Patch(':id/reset-portal-password')
  @RequireStaffRole(StaffRole.SCHOOL_OWNER, StaffRole.SCHOOL_ADMIN, StaffRole.HEADMASTER)
  resetPortalPassword(@CurrentUser() user: any, @Param('id') id: string) {
    return this.studentsService.resetPortalPassword(user.schoolId, id);
  }

  @Get(':id/performance')
  getPerformanceHistory(@CurrentUser() user: any, @Param('id') id: string) {
    return this.studentsService.getPerformanceHistory(user.schoolId, id, user.id, user.roles ?? []);
  }
}
