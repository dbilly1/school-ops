import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ReportCardConfigService } from './report-card-config.service';
import { UpdateReportCardConfigDto, UpdateCategoryWeightsDto } from './dto/report-card-config.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ManagementWriteGuard } from '../../auth/guards/management-write.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('School Setup — Report Card Config')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ManagementWriteGuard)
@Controller('school/report-card-config')
export class ReportCardConfigController {
  constructor(private service: ReportCardConfigService) {}

  @Get()
  getConfig(@CurrentUser() user: any) {
    return this.service.getConfig(user.schoolId);
  }

  @Patch()
  updateConfig(@CurrentUser() user: any, @Body() dto: UpdateReportCardConfigDto) {
    return this.service.updateConfig(user.schoolId, dto);
  }

  @Get('category-weights')
  getCategoryWeights(@CurrentUser() user: any) {
    return this.service.getCategoryWeights(user.schoolId);
  }

  @Patch('category-weights')
  updateCategoryWeights(@CurrentUser() user: any, @Body() dto: UpdateCategoryWeightsDto) {
    return this.service.updateCategoryWeights(user.schoolId, dto);
  }
}
