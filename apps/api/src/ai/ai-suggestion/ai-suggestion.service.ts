import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AiSuggestion, AiSuggestionScenario } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { runVersionedUpdate } from '../../common/utils/versioned-update.util';
import { QueryAiSuggestionDto } from './dto/query-ai-suggestion.dto';

export interface RecordSuggestionInput {
  storeId: string;
  scenario: AiSuggestionScenario;
  businessType: string;
  businessId: string;
  inputText: string;
  outputText: string;
  modelProvider: string;
  modelName: string;
  usedFallback: boolean;
  latencyMs: number;
  escalate?: boolean;
}

/**
 * AI 建议留痕：每次 Agent 调用与产生的建议全程写入审计记录（见业务规则确认记录#9/#10），
 * 包含输入、输出、调用模型、耗时与是否被人工采纳。AI 本身不具备任何业务写权限，
 * accept() 只是标记"人工已确认/采纳该建议"，不代表系统自动执行了什么写操作。
 */
@Injectable()
export class AiSuggestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
  ) {}

  findMany(query: QueryAiSuggestionDto = {}): Promise<AiSuggestion[]> {
    return this.prisma.aiSuggestion.findMany({
      where: {
        tenantId: this.ctx.tenantId,
        scenario: query.scenario,
        businessType: query.businessType,
        businessId: query.businessId,
        status: query.status,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneOrThrow(id: string): Promise<AiSuggestion> {
    const suggestion = await this.prisma.aiSuggestion.findUnique({ where: { id } });
    if (!suggestion) throw new NotFoundException(`AiSuggestion ${id} 不存在`);
    return suggestion;
  }

  async record(input: RecordSuggestionInput): Promise<AiSuggestion> {
    const created = await this.prisma.aiSuggestion.create({
      data: {
        tenantId: this.ctx.tenantId!,
        storeId: input.storeId,
        scenario: input.scenario,
        businessType: input.businessType,
        businessId: input.businessId,
        inputText: input.inputText,
        outputText: input.outputText,
        modelProvider: input.modelProvider,
        modelName: input.modelName,
        usedFallback: input.usedFallback,
        latencyMs: input.latencyMs,
        escalate: input.escalate ?? false,
        createdBy: this.ctx.accountId!,
      },
    });
    await this.auditLogService.record({
      action: 'CREATE',
      entityType: 'AiSuggestion',
      entityId: created.id,
      afterData: created,
      remark: `AI建议(${input.scenario})：模型${input.modelProvider}/${input.modelName}，耗时${input.latencyMs}ms${input.usedFallback ? '（已降级到备用供应商）' : ''}`,
      ...this.auditCtx(input.storeId),
    });
    return created;
  }

  async accept(id: string, expectedVersion: number): Promise<AiSuggestion> {
    return this.transition(id, expectedVersion, 'ACCEPTED');
  }

  async dismiss(id: string, expectedVersion: number): Promise<AiSuggestion> {
    return this.transition(id, expectedVersion, 'DISMISSED');
  }

  private async transition(id: string, expectedVersion: number, target: 'ACCEPTED' | 'DISMISSED'): Promise<AiSuggestion> {
    const before = await this.findOneOrThrow(id);
    if (before.version !== expectedVersion) throw new ConflictException('数据已被他人修改，请刷新后重试');
    if (before.status !== 'PENDING') throw new BadRequestException(`该AI建议当前状态「${before.status}」不允许此操作`);
    const updated = await runVersionedUpdate(() =>
      this.prisma.aiSuggestion.update({
        where: { id, version: expectedVersion },
        data: { status: target, acceptedById: this.ctx.accountId, acceptedAt: new Date(), version: { increment: 1 } },
      }),
    );
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'AiSuggestion',
      entityId: id,
      beforeData: before,
      afterData: updated,
      remark: `PENDING -> ${target}（人工${target === 'ACCEPTED' ? '采纳' : '忽略'}）`,
      ...this.auditCtx(before.storeId),
    });
    return updated;
  }

  private auditCtx(storeId: string) {
    return {
      tenantId: this.ctx.tenantId,
      storeId,
      accountId: this.ctx.accountId,
      ip: this.ctx.ip,
      userAgent: this.ctx.userAgent,
      requestId: this.ctx.requestId,
    };
  }
}
