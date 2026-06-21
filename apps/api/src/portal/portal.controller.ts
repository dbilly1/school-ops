import { Controller, Get, Post, Body, Param, Query, UseGuards, Res, HttpCode, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PortalService } from './portal.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtPortalGuard } from '../auth/guards/jwt-portal.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Student Portal')
@ApiBearerAuth()
@UseGuards(JwtPortalGuard)
@Controller('portal')
export class PortalController {
  constructor(private portalService: PortalService) {}

  @Get('me')
  getProfile(@CurrentUser() user: any) {
    return this.portalService.getStudentProfile(user.id);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  changePassword(@CurrentUser() user: any, @Body() dto: ChangePasswordDto) {
    return this.portalService.changePassword(user.id, dto);
  }

  @Get('attendance')
  getAttendance(
    @CurrentUser() user: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.portalService.getAttendance(user.id, user.schoolId, startDate, endDate);
  }

  @Get('timetable')
  getTimetable(@CurrentUser() user: any) {
    return this.portalService.getTimetable(user.id, user.schoolId);
  }

  @Get('grades')
  getGrades(@CurrentUser() user: any) {
    return this.portalService.getGradebook(user.id, user.schoolId);
  }

  @Get('report-cards')
  getReportCards(@CurrentUser() user: any) {
    return this.portalService.getReportCards(user.id, user.schoolId);
  }

  @Get('report-cards/:termId')
  getReportCard(@CurrentUser() user: any, @Param('termId') termId: string) {
    return this.portalService.getReportCard(user.id, user.schoolId, termId);
  }

  @Get('report-cards/:termId/pdf')
  async getReportCardPdf(
    @CurrentUser() user: any,
    @Param('termId') termId: string,
    @Res() res: Response,
  ) {
    const pdf = await this.portalService.getReportCardPdf(user.id, user.schoolId, termId);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="report-card-${termId}.pdf"`,
      'Content-Length': pdf.length,
    });
    res.end(pdf);
  }

  @Get('notices')
  getNotices(@CurrentUser() user: any) {
    return this.portalService.getNotices(user.schoolId);
  }

  @Get('transport')
  getTransportInfo(@CurrentUser() user: any) {
    return this.portalService.getTransportInfo(user.id);
  }

  @Get('feeding')
  getFeedingBalance(@CurrentUser() user: any) {
    return this.portalService.getFeedingBalance(user.id, user.schoolId);
  }

  @Get('notifications')
  getNotifications(@CurrentUser() user: any) {
    return this.portalService.getNotifications(user.id, user.schoolId);
  }
}
