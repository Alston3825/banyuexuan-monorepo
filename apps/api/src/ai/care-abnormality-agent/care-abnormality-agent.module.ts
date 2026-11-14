import { Module } from '@nestjs/common';
import { CareAbnormalityModule } from '../../care/care-abnormality/care-abnormality.module';
import { AiGatewayModule } from '../ai-gateway/ai-gateway.module';
import { AiSuggestionModule } from '../ai-suggestion/ai-suggestion.module';
import { KnowledgeRetrievalModule } from '../knowledge-retrieval/knowledge-retrieval.module';
import { CareAbnormalityAgentController } from './care-abnormality-agent.controller';
import { CareAbnormalityAgentService } from './care-abnormality-agent.service';

@Module({
  imports: [CareAbnormalityModule, AiGatewayModule, AiSuggestionModule, KnowledgeRetrievalModule],
  controllers: [CareAbnormalityAgentController],
  providers: [CareAbnormalityAgentService],
})
export class CareAbnormalityAgentModule {}
