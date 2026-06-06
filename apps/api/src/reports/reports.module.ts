import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { SchoolSetupModule } from '../school-setup/school-setup.module';

@Module({
  imports: [SchoolSetupModule],
  providers: [ReportsService],
  controllers: [ReportsController],
})
export class ReportsModule {}
