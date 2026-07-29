import { Module } from '@nestjs/common';
import { WorkflowEngineModule } from '../../workflow/workflow-engine/workflow-engine.module';
import { StockCountController } from './stock-count.controller';
import { StockCountService } from './stock-count.service';

@Module({
  imports: [WorkflowEngineModule],
  controllers: [StockCountController],
  providers: [StockCountService],
  exports: [StockCountService],
})
export class StockCountModule {}
