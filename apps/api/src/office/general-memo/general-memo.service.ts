import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { GeneralMemo } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { ActorContext } from '../../common/context/actor-context';
import { WorkflowEngineService } from '../../workflow/workflow-engine/workflow-engine.service';
import { CreateGeneralMemoDto } from './dto/create-general-memo.dto';
import { QueryGeneralMemoDto } from './dto/query-general-memo.dto';

const DEFINITION_CODE = 'OFFICE_MEMO';
const BUSINESS_TYPE = 'GENERAL_MEMO';
const includeMemo = { applicant: { select: { id: true, realName: true } } };

/**
 * 日常签呈：标题+正文自由文本的兜底通用审批入口，覆盖"以上都不是"的长尾审批需求。
 * DRAFT -(提交)-> PENDING_APPROVAL -(店长单级审批)-> APPROVED/REJECTED，与
 * LeaveRequest/ExpenseClaim 完全同构。
 */
@Injectable()
export class GeneralMemoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowEngineService: WorkflowEngineService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
  ) {}

  async findMany(query: QueryGeneralMemoDto = {}): Promise<GeneralMemo[]> {
    const memos = await this.prisma.generalMemo.findMany({
      where: { tenantId: this.ctx.tenantId, storeId: query.storeId, applicantId: query.applicantId, status: query.status },
      include: includeMemo,
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(memos.map((m) => this.reconcileStatus(m)));
  }

  async findOneOrThrow(id: string): Promise<GeneralMemo> {
    const memo = await this.prisma.generalMemo.findUnique({ where: { id }, include: includeMemo });
    if (!memo) throw new NotFoundException(`GeneralMemo ${id} 不存在`);
    return this.reconcileStatus(memo);
  }

  async create(dto: CreateGeneralMemoDto): Promise<GeneralMemo> {
    const created = await this.prisma.generalMemo.create({
      data: {
        tenantId: this.ctx.tenantId!,
        storeId: dto.storeId,
        applicantId: this.ctx.accountId!,
        title: dto.title,
        content: dto.content,
        createdBy: this.ctx.accountId!,
      },
      include: includeMemo,
    });
    await this.auditLogService.record({ action: 'CREATE', entityType: 'GeneralMemo', entityId: created.id, afterData: created, ...this.auditCtx(dto.storeId) });
    return created;
  }

  async submit(id: string, expectedVersion: number): Promise<GeneralMemo> {
    const before = await this.findOneOrThrow(id);
    this.assertVersion(before, expectedVersion);
    if (before.status !== 'DRAFT') throw new BadRequestException(`签呈当前状态「${before.status}」不允许提交`);

    await this.workflowEngineService.startInstance(
      { definitionCode: DEFINITION_CODE, businessType: BUSINESS_TYPE, businessId: id, title: before.title, storeId: before.storeId },
      this.actor(),
    );
    const updated = await this.prisma.generalMemo.update({ where: { id }, data: { status: 'PENDING_APPROVAL', version: { increment: 1 } }, include: includeMemo });
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'GeneralMemo',
      entityId: id,
      beforeData: before,
      afterData: updated,
      remark: 'DRAFT -> PENDING_APPROVAL',
      ...this.auditCtx(before.storeId),
    });
    return updated;
  }

  async cancel(id: string, cancelReason: string, expectedVersion: number): Promise<GeneralMemo> {
    const before = await this.findOneOrThrow(id);
    this.assertVersion(before, expectedVersion);
    if (!['DRAFT', 'PENDING_APPROVAL', 'APPROVED'].includes(before.status)) {
      throw new BadRequestException(`签呈当前状态「${before.status}」不允许取消`);
    }
    const updated = await this.prisma.generalMemo.update({
      where: { id },
      data: { status: 'CANCELLED', cancelReason, version: { increment: 1 } },
      include: includeMemo,
    });
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'GeneralMemo',
      entityId: id,
      beforeData: before,
      afterData: updated,
      remark: `${before.status} -> CANCELLED：${cancelReason}`,
      ...this.auditCtx(before.storeId),
    });
    return updated;
  }

  private async reconcileStatus(memo: GeneralMemo): Promise<GeneralMemo> {
    if (memo.status !== 'PENDING_APPROVAL') return memo;
    const instance = await this.prisma.workflowInstance.findFirst({
      where: { businessType: BUSINESS_TYPE, businessId: memo.id },
      orderBy: { createdAt: 'desc' },
    });
    if (!instance) return memo;

    let nextStatus: 'APPROVED' | 'REJECTED' | 'DRAFT' | null = null;
    if (instance.status === 'APPROVED' || instance.status === 'ARCHIVED') nextStatus = 'APPROVED';
    else if (instance.status === 'REJECTED') nextStatus = 'REJECTED';
    else if (instance.status === 'WITHDRAWN') nextStatus = 'DRAFT';
    if (!nextStatus) return memo;

    const updated = await this.prisma.generalMemo.update({
      where: { id: memo.id },
      data: { status: nextStatus, version: { increment: 1 } },
      include: includeMemo,
    });
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'GeneralMemo',
      entityId: memo.id,
      beforeData: memo,
      afterData: updated,
      remark: `PENDING_APPROVAL -> ${nextStatus}（同步自 WorkflowInstance ${instance.id}）`,
      ...this.auditCtx(memo.storeId),
    });
    return updated;
  }

  private assertVersion(before: GeneralMemo, expectedVersion: number): void {
    if (before.version !== expectedVersion) throw new ConflictException('数据已被他人修改，请刷新后重试');
  }

  private actor(): ActorContext {
    return {
      accountId: this.ctx.accountId,
      tenantId: this.ctx.tenantId,
      storeId: this.ctx.homeStoreId,
      ip: this.ctx.ip,
      userAgent: this.ctx.userAgent,
      requestId: this.ctx.requestId,
    };
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
