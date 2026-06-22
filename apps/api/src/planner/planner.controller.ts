import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PlannerService } from './planner.service';
import { CreatePlannerEntryDto, UpdatePlannerEntryDto } from './dto/planner.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

// The planner is a personal tool available to every staff user — no feature or
// permission gate. Entries are private: scoped to the authenticated user.
@ApiTags('Planner')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('school/planner')
export class PlannerController {
  constructor(private planner: PlannerService) {}

  @Get()
  list(
    @CurrentUser() user: any,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    return this.planner.list(user.schoolId, user.id, start, end);
  }

  @Post()
  create(@CurrentUser() user: any, @Body() dto: CreatePlannerEntryDto) {
    return this.planner.create(user.schoolId, user.id, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdatePlannerEntryDto) {
    return this.planner.update(user.schoolId, user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.planner.remove(user.schoolId, user.id, id);
  }
}
