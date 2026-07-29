import { Module } from '@nestjs/common';
import { UtilityExpenseController } from './utility-expense.controller';
import { UtilityExpenseService } from './utility-expense.service';

@Module({
  controllers: [UtilityExpenseController],
  providers: [UtilityExpenseService],
  exports: [UtilityExpenseService],
})
export class UtilityExpenseModule {}
