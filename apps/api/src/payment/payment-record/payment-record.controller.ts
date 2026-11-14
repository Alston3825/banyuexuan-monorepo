import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PaymentRecordService } from './payment-record.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { QueryPaymentDto } from './dto/query-payment.dto';
import { QueryPaymentSummaryDto } from './dto/query-payment-summary.dto';
import { RequestRefundPaymentDto } from './dto/request-refund-payment.dto';

@ApiTags('payment/record')
@Controller('payment/records')
export class PaymentRecordController {
  constructor(private readonly paymentRecordService: PaymentRecordService) {}

  @Get('summary')
  @RequirePermission('payment.record.view')
  getContractSummary(@Query() query: QueryPaymentSummaryDto) {
    return this.paymentRecordService.getContractSummary(query.contractId);
  }

  @Get()
  @RequirePermission('payment.record.view')
  findAll(@Query() query: QueryPaymentDto) {
    return this.paymentRecordService.findMany(query);
  }

  @Get(':id')
  @RequirePermission('payment.record.view')
  findOne(@Param('id') id: string) {
    return this.paymentRecordService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('payment.record.create')
  create(@Body() dto: CreatePaymentDto) {
    return this.paymentRecordService.create(dto);
  }

  @Post(':id/refund')
  @RequirePermission('payment.record.refund')
  requestRefund(@Param('id') id: string, @Body() dto: RequestRefundPaymentDto) {
    return this.paymentRecordService.requestRefund(id, dto.refundReason, dto.version);
  }
}
