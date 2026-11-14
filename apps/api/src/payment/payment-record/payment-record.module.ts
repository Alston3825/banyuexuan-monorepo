import { Module } from '@nestjs/common';
import { PaymentRecordController } from './payment-record.controller';
import { PaymentRecordService } from './payment-record.service';
import { CustomerModule } from '../../crm/customer/customer.module';
import { ContractRecordModule } from '../../contract/contract-record/contract-record.module';
import { WorkflowEngineModule } from '../../workflow/workflow-engine/workflow-engine.module';

@Module({
  imports: [CustomerModule, ContractRecordModule, WorkflowEngineModule],
  controllers: [PaymentRecordController],
  providers: [PaymentRecordService],
  exports: [PaymentRecordService],
})
export class PaymentRecordModule {}
