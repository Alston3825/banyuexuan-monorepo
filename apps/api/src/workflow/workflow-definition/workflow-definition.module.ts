import { Module } from '@nestjs/common';
import { WorkflowDefinitionController } from './workflow-definition.controller';
import { WorkflowDefinitionService } from './workflow-definition.service';

@Module({
  controllers: [WorkflowDefinitionController],
  providers: [WorkflowDefinitionService],
  exports: [WorkflowDefinitionService],
})
export class WorkflowDefinitionModule {}
