import { Module } from '@nestjs/common';
import { ContractTemplateController } from './contract-template.controller';
import { ContractTemplateService } from './contract-template.service';

@Module({
  controllers: [ContractTemplateController],
  providers: [ContractTemplateService],
  exports: [ContractTemplateService],
})
export class ContractTemplateModule {}
