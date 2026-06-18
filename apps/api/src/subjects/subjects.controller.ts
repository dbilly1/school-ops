import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SubjectsService } from './subjects.service';
import { CreateSubjectDto, UpdateSubjectDto, AssignSubjectToGradeLevelDto } from './dto/subject.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Subjects')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('school/subjects')
export class SubjectsController {
  constructor(private subjectsService: SubjectsService) {}

  @Get()
  @RequirePermission('academics', 'VIEW')
  findAll(@CurrentUser() user: any, @Query('gradeLevelId') gradeLevelId?: string) {
    return this.subjectsService.findAll(user.schoolId, gradeLevelId);
  }

  @Get(':id')
  @RequirePermission('academics', 'VIEW')
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.subjectsService.findOne(user.schoolId, id);
  }

  @Post()
  @RequirePermission('academics', 'CREATE')
  create(@CurrentUser() user: any, @Body() dto: CreateSubjectDto) {
    return this.subjectsService.create(user.schoolId, dto);
  }

  @Post('apply-curriculum')
  @RequirePermission('academics', 'CREATE')
  applyCurriculum(@CurrentUser() user: any) {
    return this.subjectsService.applyCurriculum(user.schoolId);
  }

  @Patch(':id')
  @RequirePermission('academics', 'EDIT')
  update(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateSubjectDto) {
    return this.subjectsService.update(user.schoolId, id, dto);
  }

  @Delete(':id')
  @RequirePermission('academics', 'DELETE')
  delete(@CurrentUser() user: any, @Param('id') id: string) {
    return this.subjectsService.delete(user.schoolId, id);
  }

  @Post(':id/grade-levels')
  @RequirePermission('academics', 'EDIT')
  assignToGradeLevel(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: AssignSubjectToGradeLevelDto) {
    return this.subjectsService.assignToGradeLevel(user.schoolId, id, dto);
  }

  @Delete(':id/grade-levels/:gradeLevelId')
  @RequirePermission('academics', 'DELETE')
  removeFromGradeLevel(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('gradeLevelId') gradeLevelId: string,
  ) {
    return this.subjectsService.removeFromGradeLevel(user.schoolId, id, gradeLevelId);
  }
}
