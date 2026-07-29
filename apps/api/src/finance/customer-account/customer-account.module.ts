import { Module } from '@nestjs/common';
import { CustomerAccountController } from './customer-account.controller';
import { CustomerAccountService } from './customer-account.service';
import { CustomerModule } from '../../crm/customer/customer.module';

@Module({
  imports: [CustomerModule],
  controllers: [CustomerAccountController],
  providers: [CustomerAccountService],
  exports: [CustomerAccountService],
})
export class CustomerAccountModule {}
