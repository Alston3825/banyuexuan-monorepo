import { Module } from '@nestjs/common';
import { WorkflowEngineModule } from '../workflow/workflow-engine/workflow-engine.module';
import { WorkspaceController } from './workspace.controller';
import { WorkspaceService } from './workspace.service';
import { WorkbenchService } from './workbench.service';

@Module({
  imports: [WorkflowEngineModule],
  controllers: [WorkspaceController],
  providers: [WorkspaceService, WorkbenchService],
})
export class WorkspaceModule {}
