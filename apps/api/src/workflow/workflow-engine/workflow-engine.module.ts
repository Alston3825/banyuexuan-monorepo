import { Module } from '@nestjs/common';
import { WorkflowEngineController } from './workflow-engine.controller';
import { WorkflowEngineService } from './workflow-engine.service';
import { WorkflowArchiveProcessor } from './workflow-archive.processor';

@Module({
  controllers: [WorkflowEngineController],
  providers: [WorkflowEngineService, WorkflowArchiveProcessor],
  exports: [WorkflowEngineService],
})
export class WorkflowEngineModule {}
