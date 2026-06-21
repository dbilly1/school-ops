import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ProgressionService } from './progression.service';
import { ExecuteProgressionDto } from './dto/progression.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StaffRolesGuard } from '../auth/guards/staff-roles.guard';
import { RequireStaffRole } from '../auth/decorators/staff-roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { StaffRole } from '@prisma/client';

// Year-end promotion is a high-impact Owner/Admin operation.
@ApiTags('Student Progression')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, StaffRolesGuard)
@RequireStaffRole(StaffRole.SCHOOL_OWNER, StaffRole.SCHOOL_ADMIN, StaffRole.HEADMASTER)
@Controller('school/progression')
export class ProgressionController {
  constructor(private progressionService: ProgressionService) {}

  @Get('preview')
  preview(
    @CurrentUser() user: any,
    @Query('fromYearId') fromYearId: string,
    @Query('toYearId') toYearId: string,
  ) {
    return this.progressionService.preview(user.schoolId, fromYearId, toYearId);
  }

  @Post('execute')
  execute(@CurrentUser() user: any, @Body() dto: ExecuteProgressionDto) {
    return this.progressionService.execute(user.schoolId, dto, user.id);
  }
}
