import { Module } from '@nestjs/common';
import { PortalService } from './portal.service';
import { PortalController } from './portal.controller';
import { ReportCardsModule } from '../report-cards/report-cards.module';
import { AssessmentsModule } from '../assessments/assessments.module';

@Module({
  imports: [ReportCardsModule, AssessmentsModule],
  providers: [PortalService],
  controllers: [PortalController],
})
export class PortalModule {}
