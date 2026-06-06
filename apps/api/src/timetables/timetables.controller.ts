import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TimetablesService } from './timetables.service';
import { CreateTimetableConfigDto, UpdateTimetableConfigDto, UpsertSlotDto } from './dto/timetable.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Timetables')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('school/timetables')
export class TimetablesController {
  constructor(private timetablesService: TimetablesService) {}

  @Get('config')
  @RequirePermission('academics', 'VIEW')
  getConfig(@CurrentUser() user: any, @Query('termId') termId: string) {
    return this.timetablesService.getConfig(user.schoolId, termId);
  }

  @Post('config')
  @RequirePermission('academics', 'CREATE')
  createConfig(@CurrentUser() user: any, @Body() dto: CreateTimetableConfigDto) {
    return this.timetablesService.createConfig(user.schoolId, dto);
  }

  @Patch('config')
  @RequirePermission('academics', 'EDIT')
  updateConfig(
    @CurrentUser() user: any,
    @Query('termId') termId: string,
    @Body() dto: UpdateTimetableConfigDto,
  ) {
    return this.timetablesService.updateConfig(user.schoolId, termId, dto);
  }

  @Get('class/:classId')
  @RequirePermission('academics', 'VIEW')
  getClassTimetable(
    @CurrentUser() user: any,
    @Param('classId') classId: string,
    @Query('termId') termId: string,
  ) {
    return this.timetablesService.getClassTimetable(user.schoolId, classId, termId);
  }

  @Get('teacher/:userId')
  @RequirePermission('academics', 'VIEW')
  getTeacherTimetable(
    @CurrentUser() user: any,
    @Param('userId') userId: string,
    @Query('termId') termId: string,
  ) {
    return this.timetablesService.getTeacherTimetable(user.schoolId, userId, termId);
  }

  @Post('slots')
  @RequirePermission('academics', 'EDIT')
  upsertSlot(@CurrentUser() user: any, @Body() dto: UpsertSlotDto, @Query('termId') termId: string) {
    return this.timetablesService.upsertSlot(user.schoolId, dto, termId);
  }

  @Delete('slots')
  @RequirePermission('academics', 'DELETE')
  clearSlot(
    @CurrentUser() user: any,
    @Query('classId') classId: string,
    @Query('day') day: string,
    @Query('period') period: string,
    @Query('termId') termId: string,
  ) {
    return this.timetablesService.clearSlot(user.schoolId, classId, day, Number(period), termId);
  }

  @Get('clashes')
  @RequirePermission('academics', 'VIEW')
  getClashReport(@CurrentUser() user: any, @Query('termId') termId: string) {
    return this.timetablesService.getClashReport(user.schoolId, termId);
  }
}
