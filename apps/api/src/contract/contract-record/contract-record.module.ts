import { Module } from '@nestjs/common';
import { ContractRecordController } from './contract-record.controller';
import { ContractRecordService } from './contract-record.service';
import { CustomerModule } from '../../crm/customer/customer.module';
import { WorkflowEngineModule } from '../../workflow/workflow-engine/workflow-engine.module';

@Module({
  imports: [CustomerModule, WorkflowEngineModule],
  controllers: [ContractRecordController],
  providers: [ContractRecordService],
  exports: [ContractRecordService],
})
export class ContractRecordModule {}
