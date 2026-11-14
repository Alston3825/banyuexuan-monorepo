import { Module } from '@nestjs/common';
import { ContractRecordModule } from './contract-record/contract-record.module';

@Module({
  imports: [ContractRecordModule],
})
export class ContractModule {}
