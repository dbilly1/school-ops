import { Module } from '@nestjs/common';
import { ReportCardsService } from './report-cards.service';
import { ReportCardPdfService } from './report-card-pdf.service';
import { ReportCardsController } from './report-cards.controller';
import { SchoolSetupModule } from '../school-setup/school-setup.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [SchoolSetupModule, NotificationsModule],
  providers: [ReportCardsService, ReportCardPdfService],
  controllers: [ReportCardsController],
  exports: [ReportCardsService, ReportCardPdfService],
})
export class ReportCardsModule {}
