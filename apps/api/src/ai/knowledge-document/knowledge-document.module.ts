import { Module } from '@nestjs/common';
import { AiGatewayModule } from '../ai-gateway/ai-gateway.module';
import { KnowledgeDocumentController } from './knowledge-document.controller';
import { KnowledgeDocumentService } from './knowledge-document.service';

@Module({
  imports: [AiGatewayModule],
  controllers: [KnowledgeDocumentController],
  providers: [KnowledgeDocumentService],
  exports: [KnowledgeDocumentService],
})
export class KnowledgeDocumentModule {}
