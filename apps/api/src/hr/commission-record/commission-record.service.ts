import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CommissionRecord } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { ActorContext } from '../../common/context/actor-context';
import { WorkflowEngineService } from '../../workflow/workflow-engine/workflow-engine.service';
import { runVersionedUpdate } from '../../common/utils/versioned-update.util';
import { CreateCommissionRecordDto } from './dto/create-commission-record.dto';
import { QueryCommissionRecordDto } from './dto/query-commission-record.dto';

const DEFINITION_CODE = 'HR_COMMISSION';
const BUSINESS_TYPE = 'COMMISSION_RECORD';
const includeRecord = { allocations: { include: { employeeProfile: { include: { account: { select: { id: true, realName: true } } } } } } };

/**
 * 提成记录：DRAFT -(提交)-> PENDING_APPROVAL -(工作流审批)-> APPROVED/REJECTED。
 * PENDING_APPROVAL 的推进由 reconcileStatus() 懒同步自 WorkflowInstance，
 * 与 ContractRecordService/库存各单据完全同构。审批通过(APPROVED)后才计入薪资单汇总。
 */
@Injectable()
export class CommissionRecordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowEngineService: WorkflowEngineService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
  ) {}

  async findMany(query: QueryCommissionRecordDto = {}): Promise<CommissionRecord[]> {
    const records = await this.prisma.commissionRecord.findMany({
      where: { tenantId: this.ctx.tenantId, storeId: query.storeId, type: query.type, status: query.status },
      include: includeRecord,
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(records.map((r) => this.reconcileStatus(r)));
  }

  async findOneOrThrow(id: string): Promise<CommissionRecord> {
    const record = await this.prisma.commissionRecord.findUnique({ where: { id }, include: includeRecord });
    if (!record) throw new NotFoundException(`CommissionRecord ${id} 不存在`);
    return this.reconcileStatus(record);
  }

  async create(dto: CreateCommissionRecordDto): Promise<CommissionRecord> {
    const employeeIds = [...new Set(dto.allocations.map((a) => a.employeeProfileId))];
    const employees = await this.prisma.employeeProfile.findMany({ where: { id: { in: employeeIds } } });
    if (employees.length !== employeeIds.length) throw new BadRequestException('存在不存在的员工档案 ID');

    // 每条分配独立四舍五入再求和会有舍入误差：比如3分按50%/50%拆两条，各自round(1.5)=2，
    // 合计4>3，明明是合法的对半拆分却会被下面"超出总金额"的校验误判拒绝。改成先算出
    // "分配比例对应的真实合计"并整体取整一次，再让最后一条吸收前面几条的舍入残差，
    // 保证明细合计不会因为独立取整而对不上——basisPoints合计不足10000时（有意不全额
    // 分配的情况），最后一条吸收的也只是"这部分该分到的比例"的残差，不会多分到不该给
    // 它的那部分总额。
    const rawShares = dto.allocations.map((a) => (dto.totalAmount * a.basisPoints) / 10000);
    const intendedTotal = Math.round(rawShares.reduce((sum, x) => sum + x, 0));
    let allocatedSoFar = 0;
    const allocationsWithAmount = dto.allocations.map((a, idx) => {
      const isLast = idx === dto.allocations.length - 1;
      const amount = isLast ? intendedTotal - allocatedSoFar : Math.round(rawShares[idx]);
      allocatedSoFar += amount;
      return { ...a, amount };
    });
    const allocatedTotal = allocatedSoFar;
    if (allocatedTotal > dto.totalAmount) {
      throw new BadRequestException(`分配明细合计金额（${allocatedTotal}）超出提成总金额（${dto.totalAmount}）`);
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const record = await tx.commissionRecord.create({
        data: {
          tenantId: this.ctx.tenantId!,
          storeId: dto.storeId,
          type: dto.type,
          sourceType: dto.sourceType,
          sourceId: dto.sourceId,
          totalAmount: dto.totalAmount,
          remark: dto.remark,
          createdBy: this.ctx.accountId!,
        },
      });
      await tx.commissionAllocation.createMany({
        data: allocationsWithAmount.map((a) => ({
          commissionRecordId: record.id,
          employeeProfileId: a.employeeProfileId,
          roleLabel: a.roleLabel,
          basisPoints: a.basisPoints,
          amount: a.amount,
        })),
      });
      return record;
    });
    const withAllocations = await this.findOneOrThrow(created.id);
    await this.auditLogService.record({ action: 'CREATE', entityType: 'CommissionRecord', entityId: created.id, afterData: withAllocations, ...this.auditCtx(dto.storeId) });
    return withAllocations;
  }

  async submit(id: string, expectedVersion: number): Promise<CommissionRecord> {
    const before = await this.findOneOrThrow(id);
    this.assertVersion(before, expectedVersion);
    if (before.status !== 'DRAFT') throw new BadRequestException(`提成记录当前状态「${before.status}」不允许提交`);

    await this.workflowEngineService.startInstance(
      { definitionCode: DEFINITION_CODE, businessType: BUSINESS_TYPE, businessId: id, title: `${before.type === 'SALES' ? '业绩提成' : '手工费'}-${id}`, storeId: before.storeId },
      this.actor(),
    );
    const updated = await runVersionedUpdate(() =>
      this.prisma.commissionRecord.update({
        where: { id, version: expectedVersion },
        data: { status: 'PENDING_APPROVAL', version: { increment: 1 } },
        include: includeRecord,
      }),
    );
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'CommissionRecord',
      entityId: id,
      beforeData: before,
      afterData: updated,
      remark: 'DRAFT -> PENDING_APPROVAL',
      ...this.auditCtx(before.storeId),
    });
    return updated;
  }

  async cancel(id: string, cancelReason: string, expectedVersion: number): Promise<CommissionRecord> {
    const before = await this.findOneOrThrow(id);
    this.assertVersion(before, expectedVersion);
    if (!['DRAFT', 'PENDING_APPROVAL', 'APPROVED'].includes(before.status)) {
      throw new BadRequestException(`提成记录当前状态「${before.status}」不允许取消`);
    }
    const updated = await runVersionedUpdate(() =>
      this.prisma.commissionRecord.update({
        where: { id, version: expectedVersion },
        data: { status: 'CANCELLED', cancelReason, version: { increment: 1 } },
        include: includeRecord,
      }),
    );
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'CommissionRecord',
      entityId: id,
      beforeData: before,
      afterData: updated,
      remark: `${before.status} -> CANCELLED：${cancelReason}`,
      ...this.auditCtx(before.storeId),
    });
    return updated;
  }

  private async reconcileStatus(record: CommissionRecord): Promise<CommissionRecord> {
    if (record.status !== 'PENDING_APPROVAL') return record;
    const instance = await this.prisma.workflowInstance.findFirst({
      where: { businessType: BUSINESS_TYPE, businessId: record.id },
      orderBy: { createdAt: 'desc' },
    });
    if (!instance) return record;

    let nextStatus: 'APPROVED' | 'REJECTED' | 'DRAFT' | null = null;
    if (instance.status === 'APPROVED' || instance.status === 'ARCHIVED') nextStatus = 'APPROVED';
    else if (instance.status === 'REJECTED') nextStatus = 'REJECTED';
    else if (instance.status === 'WITHDRAWN') nextStatus = 'DRAFT';
    if (!nextStatus) return record;

    const updated = await this.prisma.commissionRecord.update({
      where: { id: record.id },
      data: { status: nextStatus, version: { increment: 1 } },
      include: includeRecord,
    });
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'CommissionRecord',
      entityId: record.id,
      beforeData: record,
      afterData: updated,
      remark: `PENDING_APPROVAL -> ${nextStatus}（同步自 WorkflowInstance ${instance.id}）`,
      ...this.auditCtx(record.storeId),
    });
    return updated;
  }

  private assertVersion(before: CommissionRecord, expectedVersion: number): void {
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
