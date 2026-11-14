import { Module } from '@nestjs/common';
import { LeadModule } from '../../crm/lead/lead.module';
import { CustomerModule } from '../../crm/customer/customer.module';
import { FollowUpModule } from '../../crm/follow-up/follow-up.module';
import { AiGatewayModule } from '../ai-gateway/ai-gateway.module';
import { AiSuggestionModule } from '../ai-suggestion/ai-suggestion.module';
import { KnowledgeRetrievalModule } from '../knowledge-retrieval/knowledge-retrieval.module';
import { CustomerServiceAgentController } from './customer-service-agent.controller';
import { CustomerServiceAgentService } from './customer-service-agent.service';

@Module({
  imports: [LeadModule, CustomerModule, FollowUpModule, AiGatewayModule, AiSuggestionModule, KnowledgeRetrievalModule],
  controllers: [CustomerServiceAgentController],
  providers: [CustomerServiceAgentService],
})
export class CustomerServiceAgentModule {}
