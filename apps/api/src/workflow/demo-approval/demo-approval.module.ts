import { Module } from '@nestjs/common';
import { DemoApprovalController } from './demo-approval.controller';
import { DemoApprovalService } from './demo-approval.service';
import { WorkflowEngineModule } from '../workflow-engine/workflow-engine.module';

@Module({
  imports: [WorkflowEngineModule],
  controllers: [DemoApprovalController],
  providers: [DemoApprovalService],
  exports: [DemoApprovalService],
})
export class DemoApprovalModule {}
