import { Module } from '@nestjs/common';
import { WorkflowEngineModule } from '../../workflow/workflow-engine/workflow-engine.module';
import { GeneralMemoController } from './general-memo.controller';
import { GeneralMemoService } from './general-memo.service';

@Module({
  imports: [WorkflowEngineModule],
  controllers: [GeneralMemoController],
  providers: [GeneralMemoService],
  exports: [GeneralMemoService],
})
export class GeneralMemoModule {}
