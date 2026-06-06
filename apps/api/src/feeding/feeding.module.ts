import { Module } from '@nestjs/common';
import { FeedingService } from './feeding.service';
import { FeedingController } from './feeding.controller';
import { SchoolSetupModule } from '../school-setup/school-setup.module';

@Module({
  imports: [SchoolSetupModule],
  providers: [FeedingService],
  controllers: [FeedingController],
  exports: [FeedingService],
})
export class FeedingModule {}
