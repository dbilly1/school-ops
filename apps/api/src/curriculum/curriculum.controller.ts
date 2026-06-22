import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CurriculumService } from './curriculum.service';
import { CreateCurriculumLinkDto, UpdateCurriculumLinkDto } from './dto/curriculum-link.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

// Curriculum lives under the `academics` feature (no sub-feature):
//   • VIEW  — browse the shared GES library + the school's links (teachers have it)
//   • CREATE/EDIT/DELETE — manage the school's links (teachers don't have these,
//     so management lands with Owner/Admin/Headmaster, who bypass).
@ApiTags('Curriculum')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('school/curriculum')
export class CurriculumController {
  constructor(private curriculum: CurriculumService) {}

  @Get('resources')
  @RequirePermission('academics', 'VIEW')
  listResources(@CurrentUser() user: any) {
    return this.curriculum.listResources(user.schoolId);
  }

  @Get('resources/:id/download')
  @RequirePermission('academics', 'VIEW')
  download(@Param('id') id: string) {
    return this.curriculum.downloadResource(id);
  }

  @Get('links')
  @RequirePermission('academics', 'VIEW')
  listLinks(@CurrentUser() user: any) {
    return this.curriculum.listLinks(user.schoolId);
  }

  @Post('links')
  @RequirePermission('academics', 'CREATE')
  createLink(@CurrentUser() user: any, @Body() dto: CreateCurriculumLinkDto) {
    return this.curriculum.createLink(user.schoolId, user.id, dto);
  }

  @Patch('links/:id')
  @RequirePermission('academics', 'EDIT')
  updateLink(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateCurriculumLinkDto) {
    return this.curriculum.updateLink(user.schoolId, id, dto);
  }

  @Delete('links/:id')
  @RequirePermission('academics', 'DELETE')
  deleteLink(@CurrentUser() user: any, @Param('id') id: string) {
    return this.curriculum.deleteLink(user.schoolId, id);
  }
}
