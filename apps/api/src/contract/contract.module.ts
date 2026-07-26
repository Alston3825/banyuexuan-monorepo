import { Module } from '@nestjs/common';
import { ContractTemplateModule } from './contract-template/contract-template.module';
import { ContractRecordModule } from './contract-record/contract-record.module';

@Module({
  imports: [ContractTemplateModule, ContractRecordModule],
})
export class ContractModule {}
