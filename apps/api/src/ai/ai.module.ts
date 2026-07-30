import { Module } from '@nestjs/common';
import { AiGatewayModule } from './ai-gateway/ai-gateway.module';
import { AiSuggestionModule } from './ai-suggestion/ai-suggestion.module';
import { KnowledgeDocumentModule } from './knowledge-document/knowledge-document.module';
import { KnowledgeRetrievalModule } from './knowledge-retrieval/knowledge-retrieval.module';
import { CustomerServiceAgentModule } from './customer-service-agent/customer-service-agent.module';
import { CareAbnormalityAgentModule } from './care-abnormality-agent/care-abnormality-agent.module';
import { BusinessAnalyticsAgentModule } from './business-analytics-agent/business-analytics-agent.module';

@Module({
  imports: [
    AiGatewayModule,
    AiSuggestionModule,
    KnowledgeDocumentModule,
    KnowledgeRetrievalModule,
    CustomerServiceAgentModule,
    CareAbnormalityAgentModule,
    BusinessAnalyticsAgentModule,
  ],
})
export class AiModule {}
