import { Module } from '@nestjs/common';
import { WorkflowEngineController } from './workflow-engine.controller';
import { WorkflowEngineService } from './workflow-engine.service';
import { WorkflowArchiveProcessor } from './workflow-archive.processor';
import { WorkflowQueryService } from './workflow-query.service';

@Module({
  controllers: [WorkflowEngineController],
  providers: [WorkflowEngineService, WorkflowArchiveProcessor, WorkflowQueryService],
  exports: [WorkflowEngineService, WorkflowQueryService],
})
export class WorkflowEngineModule {}
