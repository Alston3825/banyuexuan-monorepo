import { Module } from '@nestjs/common';
import { WorkflowEngineModule } from '../../workflow/workflow-engine/workflow-engine.module';
import { PayrollRecordController } from './payroll-record.controller';
import { PayrollRecordService } from './payroll-record.service';

@Module({
  imports: [WorkflowEngineModule],
  controllers: [PayrollRecordController],
  providers: [PayrollRecordService],
  exports: [PayrollRecordService],
})
export class PayrollRecordModule {}
