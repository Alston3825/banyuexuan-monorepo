import { Module } from '@nestjs/common';
import { PaymentRecordModule } from './payment-record/payment-record.module';

@Module({
  imports: [PaymentRecordModule],
})
export class PaymentModule {}
