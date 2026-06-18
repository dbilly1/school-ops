import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AssessmentsService } from './assessments.service';
import { CreateAssessmentDto, BulkRecordScoresDto } from './dto/assessment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Assessments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('school/assessments')
export class AssessmentsController {
  constructor(private assessmentsService: AssessmentsService) {}

  @Get()
  @RequirePermission('academics', 'VIEW')
  findAll(
    @CurrentUser() user: any,
    @Query('termId') termId?: string,
    @Query('subjectId') subjectId?: string,
    @Query('classId') classId?: string,
  ) {
    return this.assessmentsService.findAll(user.schoolId, termId, subjectId, classId);
  }

  @Get('grade-book/:classId')
  @RequirePermission('academics', 'VIEW')
  getGradeBook(
    @CurrentUser() user: any,
    @Param('classId') classId: string,
    @Query('termId') termId: string,
  ) {
    return this.assessmentsService.getGradeBook(user.schoolId, classId, termId);
  }

  @Get('student/:studentId')
  @RequirePermission('academics', 'VIEW')
  getScoresByStudent(
    @CurrentUser() user: any,
    @Param('studentId') studentId: string,
    @Query('termId') termId?: string,
  ) {
    return this.assessmentsService.getScoresByStudent(user.schoolId, studentId, termId);
  }

  @Get(':id')
  @RequirePermission('academics', 'VIEW')
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.assessmentsService.findOne(user.schoolId, id);
  }

  @Post()
  @RequirePermission('academics', 'CREATE', 'assessments')
  create(@CurrentUser() user: any, @Body() dto: CreateAssessmentDto) {
    return this.assessmentsService.create(user.schoolId, dto, { id: user.id, roles: user.roles });
  }

  @Delete(':id')
  @RequirePermission('academics', 'DELETE', 'assessments')
  delete(@CurrentUser() user: any, @Param('id') id: string) {
    return this.assessmentsService.delete(user.schoolId, id, { id: user.id, roles: user.roles });
  }

  @Post(':id/scores')
  @RequirePermission('academics', 'EDIT', 'assessments')
  recordScores(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: BulkRecordScoresDto,
  ) {
    return this.assessmentsService.recordScores(user.schoolId, id, dto, { id: user.id, roles: user.roles });
  }
}
