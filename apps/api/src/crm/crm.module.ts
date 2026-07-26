import { Module } from '@nestjs/common';
import { CustomerModule } from './customer/customer.module';
import { LeadModule } from './lead/lead.module';
import { OpportunityModule } from './opportunity/opportunity.module';
import { FollowUpModule } from './follow-up/follow-up.module';

@Module({
  imports: [CustomerModule, LeadModule, OpportunityModule, FollowUpModule],
})
export class CrmModule {}
