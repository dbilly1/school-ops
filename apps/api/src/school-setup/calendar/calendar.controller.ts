import { Controller, Get, Post, Delete, Patch, Body, Param, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CalendarService } from './calendar.service';
import { CreateCalendarEventDto } from './dto/calendar.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ManagementWriteGuard } from '../../auth/guards/management-write.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('School Setup — Calendar')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ManagementWriteGuard)
@Controller('school/calendar')
export class CalendarController {
  constructor(private service: CalendarService) {}

  @Get()
  getEvents(@CurrentUser() user: any, @Query('academicYearId') academicYearId: string) {
    return this.service.getEvents(user.schoolId, academicYearId);
  }

  @Post()
  createEvent(@CurrentUser() user: any, @Body() dto: CreateCalendarEventDto) {
    return this.service.createEvent(user.schoolId, dto, user.id);
  }

  @Delete(':id')
  deleteEvent(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.deleteEvent(user.schoolId, id);
  }

  @Post('fetch-holidays/:academicYearId')
  fetchHolidays(@CurrentUser() user: any, @Param('academicYearId') academicYearId: string) {
    return this.service.fetchPublicHolidays(user.schoolId, academicYearId);
  }

  @Patch('holidays/:id/confirm')
  confirmHoliday(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.confirmHoliday(user.schoolId, id, user.id);
  }

  @Delete('holidays/:id/dismiss')
  dismissHoliday(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.dismissHoliday(user.schoolId, id);
  }
}
