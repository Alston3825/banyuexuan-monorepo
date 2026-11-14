import { Module } from '@nestjs/common';
import { CustomerAccountModule } from './customer-account/customer-account.module';

@Module({
  imports: [CustomerAccountModule],
})
export class FinanceModule {}
