import { Module } from '@nestjs/common';
import { FeedingService } from './feeding.service';
import { FeedingController } from './feeding.controller';
import { FeedingExpensesController } from './feeding-expenses.controller';
import { SchoolSetupModule } from '../school-setup/school-setup.module';
import { FinanceModule } from '../finance/finance.module';

@Module({
  imports: [SchoolSetupModule, FinanceModule],
  providers: [FeedingService],
  controllers: [FeedingController, FeedingExpensesController],
  exports: [FeedingService],
})
export class FeedingModule {}
