import { Module } from '@nestjs/common';
import { AiGatewayModule } from './ai-gateway/ai-gateway.module';
import { AiSuggestionModule } from './ai-suggestion/ai-suggestion.module';
import { CustomerServiceAgentModule } from './customer-service-agent/customer-service-agent.module';
import { CareAbnormalityAgentModule } from './care-abnormality-agent/care-abnormality-agent.module';

@Module({
  imports: [AiGatewayModule, AiSuggestionModule, CustomerServiceAgentModule, CareAbnormalityAgentModule],
})
export class AiModule {}
