import { Controller, Get, Post, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FeaturesService } from './features.service';
import { SetSubFeatureDto, BulkConfigureFeaturesDto } from './dto/features.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ManagementWriteGuard } from '../../auth/guards/management-write.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('School Setup — Features')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ManagementWriteGuard)
@Controller('school/features')
export class FeaturesController {
  constructor(private featuresService: FeaturesService) {}

  @Post('bulk-configure')
  bulkConfigure(@CurrentUser() user: any, @Body() dto: BulkConfigureFeaturesDto) {
    return this.featuresService.bulkConfigureFeatures(user.schoolId, dto);
  }

  @Get()
  listFeatures(@CurrentUser() user: any) {
    return this.featuresService.listFeatures(user.schoolId);
  }

  @Get(':featureKey/state')
  getFeatureState(@CurrentUser() user: any, @Param('featureKey') featureKey: string) {
    return this.featuresService.getFeatureState(user.schoolId, featureKey);
  }

  @Patch(':featureKey/activate')
  activateFeature(@CurrentUser() user: any, @Param('featureKey') featureKey: string) {
    return this.featuresService.activateFeature(user.schoolId, featureKey);
  }

  @Patch(':featureKey/deactivate')
  deactivateFeature(@CurrentUser() user: any, @Param('featureKey') featureKey: string) {
    return this.featuresService.deactivateFeature(user.schoolId, featureKey);
  }

  @Get(':featureKey/sub-features/:subFeatureKey')
  getSubFeatureState(
    @CurrentUser() user: any,
    @Param('featureKey') featureKey: string,
    @Param('subFeatureKey') subFeatureKey: string,
  ) {
    return this.featuresService.getSubFeatureState(user.schoolId, featureKey, subFeatureKey);
  }

  @Patch(':featureKey/sub-features/:subFeatureKey')
  setSubFeatureEnabled(
    @CurrentUser() user: any,
    @Param('featureKey') featureKey: string,
    @Param('subFeatureKey') subFeatureKey: string,
    @Body() dto: SetSubFeatureDto,
  ) {
    return this.featuresService.setSubFeatureEnabled(
      user.schoolId,
      featureKey,
      subFeatureKey,
      dto.enabled,
    );
  }
}
