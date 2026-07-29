import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CustomerAccountService } from './customer-account.service';
import { RechargeCustomerAccountDto } from './dto/recharge-customer-account.dto';
import { ConsumeCustomerAccountDto } from './dto/consume-customer-account.dto';
import { RefundCustomerAccountDto } from './dto/refund-customer-account.dto';
import { AdjustCustomerAccountDto } from './dto/adjust-customer-account.dto';

@ApiTags('finance/customer-account')
@Controller('finance/customer-accounts')
export class CustomerAccountController {
  constructor(private readonly customerAccountService: CustomerAccountService) {}

  @Get(':customerId')
  @RequirePermission('finance.customer-account.view')
  findByCustomer(@Param('customerId') customerId: string) {
    return this.customerAccountService.findByCustomer(customerId);
  }

  @Get(':customerId/transactions')
  @RequirePermission('finance.customer-account.view')
  listTransactions(@Param('customerId') customerId: string) {
    return this.customerAccountService.listTransactions(customerId);
  }

  @Post('recharge')
  @RequirePermission('finance.customer-account.recharge')
  recharge(@Body() dto: RechargeCustomerAccountDto) {
    return this.customerAccountService.recharge(dto);
  }

  @Post('consume')
  @RequirePermission('finance.customer-account.consume')
  consume(@Body() dto: ConsumeCustomerAccountDto) {
    return this.customerAccountService.consume(dto);
  }

  @Post('refund')
  @RequirePermission('finance.customer-account.refund')
  refund(@Body() dto: RefundCustomerAccountDto) {
    return this.customerAccountService.refund(dto);
  }

  @Post('adjust')
  @RequirePermission('finance.customer-account.adjust')
  adjust(@Body() dto: AdjustCustomerAccountDto) {
    return this.customerAccountService.adjust(dto);
  }
}
