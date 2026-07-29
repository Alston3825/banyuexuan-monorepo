import { Module } from '@nestjs/common';
import { WorkflowEngineModule } from '../../workflow/workflow-engine/workflow-engine.module';
import { StockIssueController } from './stock-issue.controller';
import { StockIssueService } from './stock-issue.service';

@Module({
  imports: [WorkflowEngineModule],
  controllers: [StockIssueController],
  providers: [StockIssueService],
  exports: [StockIssueService],
})
export class StockIssueModule {}
