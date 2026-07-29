import { Module } from '@nestjs/common';
import { WorkflowEngineModule } from '../../workflow/workflow-engine/workflow-engine.module';
import { LeaveRequestController } from './leave-request.controller';
import { LeaveRequestService } from './leave-request.service';

@Module({
  imports: [WorkflowEngineModule],
  controllers: [LeaveRequestController],
  providers: [LeaveRequestService],
  exports: [LeaveRequestService],
})
export class LeaveRequestModule {}
