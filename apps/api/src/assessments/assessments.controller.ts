import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, Res } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AssessmentsService } from './assessments.service';
import { AssessmentResultsPdfService } from './assessment-results-pdf.service';
import { CreateAssessmentDto, BatchCreateAssessmentDto, BulkRecordScoresDto } from './dto/assessment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Assessments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('school/assessments')
export class AssessmentsController {
  constructor(
    private assessmentsService: AssessmentsService,
    private resultsPdfService: AssessmentResultsPdfService,
  ) {}

  @Get()
  @RequirePermission('academics', 'VIEW')
  findAll(
    @CurrentUser() user: any,
    @Query('termId') termId?: string,
    @Query('subjectId') subjectId?: string,
    @Query('classId') classId?: string,
  ) {
    return this.assessmentsService.findAll(user.schoolId, { id: user.id, roles: user.roles }, termId, subjectId, classId);
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

  @Get('batches')
  @RequirePermission('academics', 'VIEW')
  findBatches(
    @CurrentUser() user: any,
    @Query('termId') termId?: string,
    @Query('classId') classId?: string,
  ) {
    return this.assessmentsService.findBatches(user.schoolId, { id: user.id, roles: user.roles }, termId, classId);
  }

  @Get('batches/:id')
  @RequirePermission('academics', 'VIEW')
  findBatch(@CurrentUser() user: any, @Param('id') id: string) {
    return this.assessmentsService.findBatch(user.schoolId, id, { id: user.id, roles: user.roles });
  }

  @Get('batches/:id/results')
  @RequirePermission('academics', 'VIEW')
  batchResults(@CurrentUser() user: any, @Param('id') id: string) {
    return this.assessmentsService.getBatchResults(user.schoolId, id, { id: user.id, roles: user.roles });
  }

  @Get('batches/:id/results/pdf')
  @RequirePermission('academics', 'VIEW')
  async batchResultsPdf(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Query('slips') slips: string,
    @Res() res: Response,
  ) {
    const pdf = await this.resultsPdfService.generate(
      user.schoolId, id, { id: user.id, roles: user.roles }, { slips: slips === 'true' },
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="results-${id}.pdf"`,
      'Content-Length': pdf.length,
    });
    res.end(pdf);
  }

  @Get(':id/scores')
  @RequirePermission('academics', 'VIEW')
  getScores(@CurrentUser() user: any, @Param('id') id: string) {
    return this.assessmentsService.getScores(user.schoolId, id);
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

  @Post('batch')
  @RequirePermission('academics', 'CREATE', 'assessments')
  batchCreate(@CurrentUser() user: any, @Body() dto: BatchCreateAssessmentDto) {
    return this.assessmentsService.batchCreate(user.schoolId, dto, { id: user.id, roles: user.roles });
  }

  @Delete('batches/:id')
  @RequirePermission('academics', 'DELETE', 'assessments')
  deleteBatch(@CurrentUser() user: any, @Param('id') id: string) {
    return this.assessmentsService.deleteBatch(user.schoolId, id, { id: user.id, roles: user.roles });
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
