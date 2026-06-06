import { Global, Module } from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { PermissionsGuard } from './permissions.guard';
import { PermissionsController } from './permissions.controller';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';

@Global()
@Module({
  imports: [FeatureFlagsModule],
  providers: [PermissionsService, PermissionsGuard],
  controllers: [PermissionsController],
  exports: [PermissionsService, PermissionsGuard],
})
export class PermissionsModule {}
