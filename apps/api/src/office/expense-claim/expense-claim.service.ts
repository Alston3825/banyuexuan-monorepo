import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ExpenseClaim } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { ActorContext } from '../../common/context/actor-context';
import { runVersionedUpdate } from '../../common/utils/versioned-update.util';
import { WorkflowEngineService } from '../../workflow/workflow-engine/workflow-engine.service';
import { CreateExpenseClaimDto } from './dto/create-expense-claim.dto';
import { QueryExpenseClaimDto } from './dto/query-expense-claim.dto';

const DEFINITION_CODE = 'OFFICE_EXPENSE';
const BUSINESS_TYPE = 'EXPENSE_CLAIM';
const includeClaim = { applicant: { select: { id: true, realName: true } } };

/**
 * 报销申请：DRAFT -(提交)-> PENDING_APPROVAL -(店长单级审批)-> APPROVED/REJECTED。
 * 申请人固定为当前登录账号（谁提交谁报销），不允许代他人申请，避免越权代填。
 */
@Injectable()
export class ExpenseClaimService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowEngineService: WorkflowEngineService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
  ) {}

  async findMany(query: QueryExpenseClaimDto = {}): Promise<ExpenseClaim[]> {
    const claims = await this.prisma.expenseClaim.findMany({
      where: { tenantId: this.ctx.tenantId, storeId: query.storeId, applicantId: query.applicantId, status: query.status },
      include: includeClaim,
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(claims.map((c) => this.reconcileStatus(c)));
  }

  async findOneOrThrow(id: string): Promise<ExpenseClaim> {
    const claim = await this.prisma.expenseClaim.findUnique({ where: { id }, include: includeClaim });
    if (!claim) throw new NotFoundException(`ExpenseClaim ${id} 不存在`);
    return this.reconcileStatus(claim);
  }

  async create(dto: CreateExpenseClaimDto): Promise<ExpenseClaim> {
    const created = await this.prisma.expenseClaim.create({
      data: {
        tenantId: this.ctx.tenantId!,
        storeId: dto.storeId,
        applicantId: this.ctx.accountId!,
        amount: dto.amount,
        category: dto.category,
        reason: dto.reason,
        createdBy: this.ctx.accountId!,
      },
      include: includeClaim,
    });
    await this.auditLogService.record({ action: 'CREATE', entityType: 'ExpenseClaim', entityId: created.id, afterData: created, ...this.auditCtx(dto.storeId) });
    return created;
  }

  async submit(id: string, expectedVersion: number): Promise<ExpenseClaim> {
    const before = await this.findOneOrThrow(id);
    this.assertVersion(before, expectedVersion);
    if (before.status !== 'DRAFT') throw new BadRequestException(`报销申请当前状态「${before.status}」不允许提交`);

    await this.workflowEngineService.startInstance(
      { definitionCode: DEFINITION_CODE, businessType: BUSINESS_TYPE, businessId: id, title: `报销申请-${id}`, storeId: before.storeId },
      this.actor(),
    );
    const updated = await runVersionedUpdate(() =>
      this.prisma.expenseClaim.update({ where: { id, version: expectedVersion }, data: { status: 'PENDING_APPROVAL', version: { increment: 1 } }, include: includeClaim }),
    );
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'ExpenseClaim',
      entityId: id,
      beforeData: before,
      afterData: updated,
      remark: 'DRAFT -> PENDING_APPROVAL',
      ...this.auditCtx(before.storeId),
    });
    return updated;
  }

  async cancel(id: string, cancelReason: string, expectedVersion: number): Promise<ExpenseClaim> {
    const before = await this.findOneOrThrow(id);
    this.assertVersion(before, expectedVersion);
    if (!['DRAFT', 'PENDING_APPROVAL', 'APPROVED'].includes(before.status)) {
      throw new BadRequestException(`报销申请当前状态「${before.status}」不允许取消`);
    }
    const updated = await runVersionedUpdate(() =>
      this.prisma.expenseClaim.update({
        where: { id, version: expectedVersion },
        data: { status: 'CANCELLED', cancelReason, version: { increment: 1 } },
        include: includeClaim,
      }),
    );
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'ExpenseClaim',
      entityId: id,
      beforeData: before,
      afterData: updated,
      remark: `${before.status} -> CANCELLED：${cancelReason}`,
      ...this.auditCtx(before.storeId),
    });
    return updated;
  }

  private async reconcileStatus(claim: ExpenseClaim): Promise<ExpenseClaim> {
    if (claim.status !== 'PENDING_APPROVAL') return claim;
    const instance = await this.prisma.workflowInstance.findFirst({
      where: { businessType: BUSINESS_TYPE, businessId: claim.id },
      orderBy: { createdAt: 'desc' },
    });
    if (!instance) return claim;

    let nextStatus: 'APPROVED' | 'REJECTED' | 'DRAFT' | null = null;
    if (instance.status === 'APPROVED' || instance.status === 'ARCHIVED') nextStatus = 'APPROVED';
    else if (instance.status === 'REJECTED') nextStatus = 'REJECTED';
    else if (instance.status === 'WITHDRAWN') nextStatus = 'DRAFT';
    if (!nextStatus) return claim;

    const updated = await this.prisma.expenseClaim.update({
      where: { id: claim.id },
      data: { status: nextStatus, version: { increment: 1 } },
      include: includeClaim,
    });
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'ExpenseClaim',
      entityId: claim.id,
      beforeData: claim,
      afterData: updated,
      remark: `PENDING_APPROVAL -> ${nextStatus}（同步自 WorkflowInstance ${instance.id}）`,
      ...this.auditCtx(claim.storeId),
    });
    return updated;
  }

  private assertVersion(before: ExpenseClaim, expectedVersion: number): void {
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
