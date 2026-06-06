import { Controller, Get, Post, Delete, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CommunicationService } from './communication.service';
import { CreateNoticeDto, CreateAnnouncementDto } from './dto/communication.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Communication')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('school/communication')
export class CommunicationController {
  constructor(private communicationService: CommunicationService) {}

  // Notices
  @Get('notices')
  @RequirePermission('communication', 'VIEW')
  findNotices(@CurrentUser() user: any, @Query('published') published?: string) {
    return this.communicationService.findNotices(user.schoolId, published === 'true');
  }

  @Post('notices')
  @RequirePermission('communication', 'CREATE', 'notices')
  createNotice(@CurrentUser() user: any, @Body() dto: CreateNoticeDto) {
    return this.communicationService.createNotice(user.schoolId, dto, user.id);
  }

  @Patch('notices/:id/publish')
  @RequirePermission('communication', 'EDIT', 'notices')
  publishNotice(@CurrentUser() user: any, @Param('id') id: string) {
    return this.communicationService.publishNotice(user.schoolId, id);
  }

  @Delete('notices/:id')
  @RequirePermission('communication', 'DELETE', 'notices')
  deleteNotice(@CurrentUser() user: any, @Param('id') id: string) {
    return this.communicationService.deleteNotice(user.schoolId, id);
  }

  // Announcements
  @Get('announcements')
  @RequirePermission('communication', 'VIEW')
  findAnnouncements(@CurrentUser() user: any, @Query('published') published?: string) {
    return this.communicationService.findAnnouncements(user.schoolId, published === 'true');
  }

  @Post('announcements')
  @RequirePermission('communication', 'CREATE', 'announcements')
  createAnnouncement(@CurrentUser() user: any, @Body() dto: CreateAnnouncementDto) {
    return this.communicationService.createAnnouncement(user.schoolId, dto, user.id);
  }

  @Patch('announcements/:id/publish')
  @RequirePermission('communication', 'EDIT', 'announcements')
  publishAnnouncement(@CurrentUser() user: any, @Param('id') id: string) {
    return this.communicationService.publishAnnouncement(user.schoolId, id);
  }

  @Delete('announcements/:id')
  @RequirePermission('communication', 'DELETE', 'announcements')
  deleteAnnouncement(@CurrentUser() user: any, @Param('id') id: string) {
    return this.communicationService.deleteAnnouncement(user.schoolId, id);
  }
}
