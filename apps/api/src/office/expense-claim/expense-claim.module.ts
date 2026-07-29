import { Module } from '@nestjs/common';
import { WorkflowEngineModule } from '../../workflow/workflow-engine/workflow-engine.module';
import { ExpenseClaimController } from './expense-claim.controller';
import { ExpenseClaimService } from './expense-claim.service';

@Module({
  imports: [WorkflowEngineModule],
  controllers: [ExpenseClaimController],
  providers: [ExpenseClaimService],
  exports: [ExpenseClaimService],
})
export class ExpenseClaimModule {}
