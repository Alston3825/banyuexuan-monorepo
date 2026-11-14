import { Module } from '@nestjs/common';
import { CustomerModule } from './customer/customer.module';
import { CustomerChannelModule } from './customer-channel/customer-channel.module';
import { LeadModule } from './lead/lead.module';
import { OpportunityModule } from './opportunity/opportunity.module';
import { FollowUpModule } from './follow-up/follow-up.module';

@Module({
  imports: [CustomerModule, CustomerChannelModule, LeadModule, OpportunityModule, FollowUpModule],
})
export class CrmModule {}
