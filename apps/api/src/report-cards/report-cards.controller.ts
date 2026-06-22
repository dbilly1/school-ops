import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Res } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ReportCardsService } from './report-cards.service';
import { ReportCardPdfService } from './report-card-pdf.service';
import { CancelReportCardsDto, GenerateReportCardsDto, PublishReportCardsDto, UpdateReportCardDto } from './dto/report-card.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Report Cards')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('school/report-cards')
export class ReportCardsController {
  constructor(
    private reportCardsService: ReportCardsService,
    private pdfService: ReportCardPdfService,
  ) {}

  @Post('generate')
  @RequirePermission('academics', 'CREATE', 'report_cards')
  generate(@CurrentUser() user: any, @Body() dto: GenerateReportCardsDto) {
    return this.reportCardsService.generate(user.schoolId, dto, { id: user.id, roles: user.roles });
  }

  @Get('class/:classId')
  @RequirePermission('academics', 'VIEW', 'report_cards')
  findForClass(
    @CurrentUser() user: any,
    @Param('classId') classId: string,
    @Query('termId') termId: string,
  ) {
    return this.reportCardsService.findForClass(user.schoolId, classId, termId);
  }

  @Get('student/:studentId')
  @RequirePermission('academics', 'VIEW', 'report_cards')
  getStudentReportCard(
    @CurrentUser() user: any,
    @Param('studentId') studentId: string,
    @Query('termId') termId: string,
  ) {
    return this.reportCardsService.getStudentReportCard(user.schoolId, studentId, termId);
  }

  @Get('student/:studentId/pdf')
  @RequirePermission('academics', 'VIEW', 'report_cards')
  async getPdf(
    @CurrentUser() user: any,
    @Param('studentId') studentId: string,
    @Query('termId') termId: string,
    @Res() res: Response,
  ) {
    const pdf = await this.pdfService.generate(user.schoolId, studentId, termId);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="report-card-${studentId}.pdf"`,
      'Content-Length': pdf.length,
    });
    res.end(pdf);
  }

  @Post('publish')
  @RequirePermission('academics', 'EDIT', 'report_cards')
  publish(@CurrentUser() user: any, @Body() dto: PublishReportCardsDto) {
    return this.reportCardsService.publish(user.schoolId, dto, user.id, { id: user.id, roles: user.roles });
  }

  @Post('cancel')
  @RequirePermission('academics', 'EDIT', 'report_cards')
  cancelGenerate(@CurrentUser() user: any, @Body() dto: CancelReportCardsDto) {
    return this.reportCardsService.cancelGenerate(user.schoolId, dto, { id: user.id, roles: user.roles });
  }

  @Patch('student/:studentId')
  @RequirePermission('academics', 'EDIT', 'report_cards')
  updateReportCard(
    @CurrentUser() user: any,
    @Param('studentId') studentId: string,
    @Query('termId') termId: string,
    @Body() dto: UpdateReportCardDto,
  ) {
    return this.reportCardsService.updateReportCard(user.schoolId, studentId, termId, dto, { id: user.id, roles: user.roles });
  }
}
