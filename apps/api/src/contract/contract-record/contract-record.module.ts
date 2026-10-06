import { Module } from '@nestjs/common';
import { ContractRecordController } from './contract-record.controller';
import { ContractRecordService } from './contract-record.service';
import { CustomerModule } from '../../crm/customer/customer.module';
import { AiGatewayModule } from '../../ai/ai-gateway/ai-gateway.module';
import { ContractStorageService } from '../contract-storage/contract-storage.service';
import { ContractExtractionService } from '../contract-extraction/contract-extraction.service';

@Module({
  imports: [CustomerModule, AiGatewayModule],
  controllers: [ContractRecordController],
  providers: [ContractRecordService, ContractStorageService, ContractExtractionService],
  exports: [ContractRecordService],
})
export class ContractRecordModule {}
