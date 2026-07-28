import { Module } from '@nestjs/common';
import { CareFieldDefinitionController } from './care-field-definition.controller';
import { CareFieldDefinitionService } from './care-field-definition.service';

@Module({
  controllers: [CareFieldDefinitionController],
  providers: [CareFieldDefinitionService],
  exports: [CareFieldDefinitionService],
})
export class CareFieldDefinitionModule {}
