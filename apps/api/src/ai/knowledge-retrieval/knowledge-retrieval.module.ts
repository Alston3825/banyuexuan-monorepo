import { Module } from '@nestjs/common';
import { AiGatewayModule } from '../ai-gateway/ai-gateway.module';
import { KnowledgeRetrievalService } from './knowledge-retrieval.service';

@Module({
  imports: [AiGatewayModule],
  providers: [KnowledgeRetrievalService],
  exports: [KnowledgeRetrievalService],
})
export class KnowledgeRetrievalModule {}
