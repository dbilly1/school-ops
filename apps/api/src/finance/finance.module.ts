import { Module } from '@nestjs/common';
import { FinanceService } from './finance.service';
import { FinanceController } from './finance.controller';
import { ExpensesService } from './expenses/expenses.service';
import { ExpensesController } from './expenses/expenses.controller';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [PermissionsModule],
  providers: [FinanceService, ExpensesService],
  controllers: [FinanceController, ExpensesController],
  exports: [FinanceService, ExpensesService],
})
export class FinanceModule {}
