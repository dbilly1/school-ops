import { Module } from '@nestjs/common';
import { PortalService } from './portal.service';
import { PortalController } from './portal.controller';
import { ReportCardsModule } from '../report-cards/report-cards.module';

@Module({
  imports: [ReportCardsModule],
  providers: [PortalService],
  controllers: [PortalController],
})
export class PortalModule {}
