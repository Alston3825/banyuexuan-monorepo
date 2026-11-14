import { Module } from '@nestjs/common';
import { LeaveRequestModule } from './leave-request/leave-request.module';
import { ExpenseClaimModule } from './expense-claim/expense-claim.module';
import { GeneralMemoModule } from './general-memo/general-memo.module';

@Module({
  imports: [LeaveRequestModule, ExpenseClaimModule, GeneralMemoModule],
})
export class OfficeModule {}
