import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { AiGatewayClient } from '../ai-gateway/ai-gateway.client';
import { cosineSimilarity } from '../common/chunk-text.util';

export interface RetrievedChunk {
  documentId: string;
  documentTitle: string;
  content: string;
  score: number;
}

/**
 * RAG 检索：不引入独立向量数据库，对该租户全部 KnowledgeChunk 做应用层暴力余弦相似度
 * 计算取 top-K（见业务规则确认记录"P4 RAG知识库接入中"章节）。两个Agent场景都调用本服务。
 */
@Injectable()
export class KnowledgeRetrievalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiGatewayClient: AiGatewayClient,
    private readonly ctx: RequestContextService,
  ) {}

  async search(query: string, topK = 3): Promise<RetrievedChunk[]> {
    const chunks = await this.prisma.knowledgeChunk.findMany({
      where: { tenantId: this.ctx.tenantId, document: { status: 'ACTIVE' } },
      include: { document: { select: { id: true, title: true } } },
    });
    if (chunks.length === 0) return [];

    const { embeddings } = await this.aiGatewayClient.embed([query]);
    const queryEmbedding = embeddings[0];

    return chunks
      .map((chunk) => ({
        documentId: chunk.document.id,
        documentTitle: chunk.document.title,
        content: chunk.content,
        score: cosineSimilarity(queryEmbedding, chunk.embedding as number[]),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}
