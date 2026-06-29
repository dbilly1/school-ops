import { Module } from '@nestjs/common';
import { TransportService } from './transport.service';
import { TransportController } from './transport.controller';
import { TransportFeesService } from './transport-fees.service';
import { TransportFeesController } from './transport-fees.controller';
import { TransportExpensesController } from './transport-expenses.controller';
import { SchoolSetupModule } from '../school-setup/school-setup.module';
import { FinanceModule } from '../finance/finance.module';

@Module({
  imports: [SchoolSetupModule, FinanceModule],
  providers: [TransportService, TransportFeesService],
  controllers: [TransportController, TransportFeesController, TransportExpensesController],
  exports: [TransportService],
})
export class TransportModule {}
