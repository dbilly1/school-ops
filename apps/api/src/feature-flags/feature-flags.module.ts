import { Module } from '@nestjs/common';
import { FeatureFlagsService } from './feature-flags.service';
import { FeatureFlagsGuard } from './feature-flags.guard';

@Module({
  providers: [FeatureFlagsService, FeatureFlagsGuard],
  exports: [FeatureFlagsService, FeatureFlagsGuard],
})
export class FeatureFlagsModule {}
