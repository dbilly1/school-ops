import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AttendanceService } from './attendance.service';
import { BulkMarkAttendanceDto, MarkStaffAttendanceDto } from './dto/attendance.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Attendance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('school/attendance')
export class AttendanceController {
  constructor(private attendanceService: AttendanceService) {}

  // Student
  @Get('class/:classId')
  @RequirePermission('attendance', 'VIEW')
  getClassAttendance(
    @CurrentUser() user: any,
    @Param('classId') classId: string,
    @Query('date') date: string,
  ) {
    return this.attendanceService.getClassAttendance(user.schoolId, classId, date, { id: user.id, roles: user.roles });
  }

  @Post('students/bulk')
  @RequirePermission('attendance', 'CREATE', 'student_attendance')
  bulkMark(@CurrentUser() user: any, @Body() dto: BulkMarkAttendanceDto) {
    return this.attendanceService.bulkMark(user.schoolId, dto, { id: user.id, roles: user.roles });
  }

  @Get('students/:studentId')
  @RequirePermission('attendance', 'VIEW')
  getStudentAttendance(
    @CurrentUser() user: any,
    @Param('studentId') studentId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.attendanceService.getStudentAttendance(user.schoolId, studentId, startDate, endDate);
  }

  @Get('class/:classId/summary')
  @RequirePermission('attendance', 'VIEW')
  getClassSummary(
    @CurrentUser() user: any,
    @Param('classId') classId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.attendanceService.getClassAttendanceSummary(user.schoolId, classId, startDate, endDate, { id: user.id, roles: user.roles });
  }

  // Staff
  @Get('staff')
  @RequirePermission('attendance', 'VIEW', 'staff_attendance')
  getStaffAttendance(@CurrentUser() user: any, @Query('date') date: string) {
    return this.attendanceService.getStaffAttendance(user.schoolId, date);
  }

  @Post('staff')
  @RequirePermission('attendance', 'CREATE', 'staff_attendance')
  markStaffAttendance(@CurrentUser() user: any, @Body() dto: MarkStaffAttendanceDto) {
    return this.attendanceService.markStaffAttendance(user.schoolId, dto, user.id);
  }
}
