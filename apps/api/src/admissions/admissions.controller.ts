import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AdmissionsService } from './admissions.service';
import {
  CreateAdmissionDto, UpdateAdmissionStageDto,
  AddFollowUpDto, AdmissionFieldConfigDto,
} from './dto/admissions.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Admissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('school/admissions')
export class AdmissionsController {
  constructor(private admissionsService: AdmissionsService) {}

  @Get('field-config')
  @RequirePermission('admissions', 'VIEW')
  getFieldConfigs(@CurrentUser() user: any) {
    return this.admissionsService.getFieldConfigs(user.schoolId);
  }

  @Post('field-config')
  @RequirePermission('admissions', 'EDIT')
  upsertFieldConfig(@CurrentUser() user: any, @Body() dto: AdmissionFieldConfigDto) {
    return this.admissionsService.upsertFieldConfig(user.schoolId, dto);
  }

  @Get()
  @RequirePermission('admissions', 'VIEW')
  findAll(@CurrentUser() user: any, @Query('stage') stage?: string) {
    return this.admissionsService.findAll(user.schoolId, stage);
  }

  @Get('stats/conversion')
  @RequirePermission('admissions', 'VIEW')
  getConversionStats(@CurrentUser() user: any) {
    return this.admissionsService.getConversionStats(user.schoolId);
  }

  @Get(':id')
  @RequirePermission('admissions', 'VIEW')
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.admissionsService.findOne(user.schoolId, id);
  }

  @Post()
  @RequirePermission('admissions', 'CREATE')
  create(@CurrentUser() user: any, @Body() dto: CreateAdmissionDto) {
    return this.admissionsService.create(user.schoolId, dto, user.id);
  }

  @Patch(':id/stage')
  @RequirePermission('admissions', 'EDIT')
  updateStage(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateAdmissionStageDto,
  ) {
    return this.admissionsService.updateStage(user.schoolId, id, dto, user.id);
  }

  @Post(':id/follow-ups')
  @RequirePermission('admissions', 'EDIT')
  addFollowUp(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: AddFollowUpDto,
  ) {
    return this.admissionsService.addFollowUp(user.schoolId, id, dto, user.id);
  }
}
