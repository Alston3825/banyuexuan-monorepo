import { Module } from '@nestjs/common';
import { ShiftDefinitionController } from './shift-definition.controller';
import { ShiftDefinitionService } from './shift-definition.service';

@Module({
  controllers: [ShiftDefinitionController],
  providers: [ShiftDefinitionService],
  exports: [ShiftDefinitionService],
})
export class ShiftDefinitionModule {}
