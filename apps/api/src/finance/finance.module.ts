import { Module } from '@nestjs/common';
import { FinanceService } from './finance.service';
import { FinanceController } from './finance.controller';
import { ExpensesService } from './expenses/expenses.service';
import { ExpensesController } from './expenses/expenses.controller';
import { FeeSetupService } from './fee-setup/fee-setup.service';
import { FeeSetupController } from './fee-setup/fee-setup.controller';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [PermissionsModule],
  providers: [FinanceService, ExpensesService, FeeSetupService],
  controllers: [FinanceController, ExpensesController, FeeSetupController],
  exports: [FinanceService, ExpensesService, FeeSetupService],
})
export class FinanceModule {}
