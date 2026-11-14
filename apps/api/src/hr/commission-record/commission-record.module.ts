import { Module } from '@nestjs/common';
import { WorkflowEngineModule } from '../../workflow/workflow-engine/workflow-engine.module';
import { CommissionRecordController } from './commission-record.controller';
import { CommissionRecordService } from './commission-record.service';

@Module({
  imports: [WorkflowEngineModule],
  controllers: [CommissionRecordController],
  providers: [CommissionRecordService],
  exports: [CommissionRecordService],
})
export class CommissionRecordModule {}
