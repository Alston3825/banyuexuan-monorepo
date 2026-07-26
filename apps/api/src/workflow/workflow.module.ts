import { Module } from '@nestjs/common';
import { WorkflowEngineModule } from './workflow-engine/workflow-engine.module';
import { WorkflowDefinitionModule } from './workflow-definition/workflow-definition.module';
import { DemoApprovalModule } from './demo-approval/demo-approval.module';

@Module({
  imports: [WorkflowEngineModule, WorkflowDefinitionModule, DemoApprovalModule],
})
export class WorkflowModule {}
