import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { KnowledgeDocument } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { runVersionedUpdate } from '../../common/utils/versioned-update.util';
import { AiGatewayClient } from '../ai-gateway/ai-gateway.client';
import { chunkText } from '../common/chunk-text.util';
import { CreateKnowledgeDocumentDto } from './dto/create-knowledge-document.dto';
import { UpdateKnowledgeDocumentDto } from './dto/update-knowledge-document.dto';

/**
 * 知识库文档：创建/更新正文时按固定长度分段并调用模型网关生成embedding写入KnowledgeChunk，
 * 供 KnowledgeRetrievalService 检索。只做"手动创建文档"入口，不自动同步其他业务表内容
 * （见业务规则确认记录"P4 RAG知识库接入中"章节）。
 */
@Injectable()
export class KnowledgeDocumentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiGatewayClient: AiGatewayClient,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
  ) {}

  findMany(): Promise<KnowledgeDocument[]> {
    return this.prisma.knowledgeDocument.findMany({ where: { tenantId: this.ctx.tenantId }, orderBy: { createdAt: 'desc' } });
  }

  async findOneOrThrow(id: string): Promise<KnowledgeDocument> {
    const doc = await this.prisma.knowledgeDocument.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException(`KnowledgeDocument ${id} 不存在`);
    return doc;
  }

  async create(dto: CreateKnowledgeDocumentDto): Promise<KnowledgeDocument> {
    const document = await this.prisma.knowledgeDocument.create({
      data: {
        tenantId: this.ctx.tenantId!,
        title: dto.title,
        content: dto.content,
        category: dto.category,
        createdBy: this.ctx.accountId!,
      },
    });
    await this.rebuildChunks(document.id, dto.content);
    await this.auditLogService.record({ action: 'CREATE', entityType: 'KnowledgeDocument', entityId: document.id, afterData: document, ...this.auditCtx() });
    return document;
  }

  async update(id: string, dto: UpdateKnowledgeDocumentDto): Promise<KnowledgeDocument> {
    const before = await this.findOneOrThrow(id);
    if (before.version !== dto.version) throw new ConflictException('数据已被他人修改，请刷新后重试');

    const updated = await runVersionedUpdate(() =>
      this.prisma.knowledgeDocument.update({
        where: { id, version: dto.version },
        data: {
          title: dto.title,
          content: dto.content,
          category: dto.category,
          status: dto.status,
          version: { increment: 1 },
        },
      }),
    );
    if (dto.content !== undefined && dto.content !== before.content) {
      await this.rebuildChunks(id, dto.content);
    }
    await this.auditLogService.record({
      action: 'UPDATE',
      entityType: 'KnowledgeDocument',
      entityId: id,
      beforeData: before,
      afterData: updated,
      changedFields: Object.keys(dto).filter((k) => k !== 'version'),
      ...this.auditCtx(),
    });
    return updated;
  }

  async delete(id: string): Promise<void> {
    const before = await this.findOneOrThrow(id);
    await this.prisma.knowledgeDocument.delete({ where: { id } });
    await this.auditLogService.record({ action: 'DELETE', entityType: 'KnowledgeDocument', entityId: id, beforeData: before, ...this.auditCtx() });
  }

  /** 分段+调用模型网关生成embedding，替换该文档下的全部chunk。 */
  private async rebuildChunks(documentId: string, content: string): Promise<void> {
    const pieces = chunkText(content);
    await this.prisma.knowledgeChunk.deleteMany({ where: { documentId } });
    if (pieces.length === 0) return;

    const result = await this.aiGatewayClient.embed(pieces);
    await this.prisma.knowledgeChunk.createMany({
      data: pieces.map((piece, index) => ({
        tenantId: this.ctx.tenantId!,
        documentId,
        chunkIndex: index,
        content: piece,
        embedding: result.embeddings[index],
      })),
    });
  }

  private auditCtx() {
    return {
      tenantId: this.ctx.tenantId,
      storeId: this.ctx.homeStoreId,
      accountId: this.ctx.accountId,
      ip: this.ctx.ip,
      userAgent: this.ctx.userAgent,
      requestId: this.ctx.requestId,
    };
  }
}
