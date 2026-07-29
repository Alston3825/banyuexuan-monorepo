import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { StockIssue } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { ActorContext } from '../../common/context/actor-context';
import { generateBusinessNo } from '../../common/utils/business-no.util';
import { WorkflowEngineService } from '../../workflow/workflow-engine/workflow-engine.service';
import { consumeBatchesFefo } from '../common/fefo-batch.util';
import { CreateStockIssueDto } from './dto/create-stock-issue.dto';
import { QueryStockIssueDto } from './dto/query-stock-issue.dto';

const DEFINITION_CODE = 'INVENTORY_STOCK_ISSUE';
const BUSINESS_TYPE = 'STOCK_ISSUE';
const includeIssue = { warehouse: true, items: { include: { item: true } } };

/**
 * 出库/领用单(CK/LY，issueType区分)：DRAFT -(提交)-> [按仓库 requiresApproval 决定是否
 * 走工作流]-> APPROVED -(执行)-> COMPLETED（按 FEFO 扣减批次，WarehouseStock.avgCost
 * 不变）。PENDING_APPROVAL 的推进由 reconcileStatus() 懒同步，与 ContractRecordService 同构。
 */
@Injectable()
export class StockIssueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowEngineService: WorkflowEngineService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
  ) {}

  async findMany(query: QueryStockIssueDto = {}): Promise<StockIssue[]> {
    const issues = await this.prisma.stockIssue.findMany({
      where: { tenantId: this.ctx.tenantId, storeId: query.storeId, warehouseId: query.warehouseId, issueType: query.issueType, status: query.status },
      include: includeIssue,
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(issues.map((i) => this.reconcileStatus(i)));
  }

  async findOneOrThrow(id: string): Promise<StockIssue> {
    const issue = await this.prisma.stockIssue.findUnique({ where: { id }, include: includeIssue });
    if (!issue) throw new NotFoundException(`StockIssue ${id} 不存在`);
    return this.reconcileStatus(issue);
  }

  async create(dto: CreateStockIssueDto): Promise<StockIssue> {
    const itemIds = [...new Set(dto.items.map((i) => i.itemId))];
    const items = await this.prisma.inventoryItem.findMany({ where: { id: { in: itemIds } } });
    if (items.length !== itemIds.length) throw new BadRequestException('存在不存在的物品 ID');

    for (const line of dto.items) {
      const stock = await this.prisma.warehouseStock.findUnique({ where: { warehouseId_itemId: { warehouseId: dto.warehouseId, itemId: line.itemId } } });
      if (!stock || stock.quantity < line.quantity) {
        const item = items.find((it) => it.id === line.itemId)!;
        throw new BadRequestException(`物品「${item.name}」当前库存不足（现有 ${stock?.quantity ?? 0}，需要 ${line.quantity}）`);
      }
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const issue = await tx.stockIssue.create({
        data: {
          tenantId: this.ctx.tenantId!,
          storeId: dto.storeId,
          warehouseId: dto.warehouseId,
          issueNo: generateBusinessNo('CK'),
          issueType: dto.issueType ?? 'ISSUE',
          remark: dto.remark,
          createdBy: this.ctx.accountId!,
        },
      });
      await tx.stockIssueItem.createMany({ data: dto.items.map((i) => ({ stockIssueId: issue.id, itemId: i.itemId, quantity: i.quantity })) });
      return issue;
    });
    const withItems = await this.findOneOrThrow(created.id);
    await this.auditLogService.record({ action: 'CREATE', entityType: 'StockIssue', entityId: created.id, afterData: withItems, ...this.auditCtx(dto.storeId) });
    return withItems;
  }

  async submit(id: string, expectedVersion: number): Promise<StockIssue> {
    const before = await this.findOneOrThrow(id);
    this.assertVersion(before, expectedVersion);
    if (before.status !== 'DRAFT') throw new BadRequestException(`出库/领用单当前状态「${before.status}」不允许提交`);

    const warehouse = await this.prisma.warehouse.findUniqueOrThrow({ where: { id: before.warehouseId } });
    if (!warehouse.requiresApproval) {
      const updated = await this.prisma.stockIssue.update({ where: { id }, data: { status: 'APPROVED', version: { increment: 1 } }, include: includeIssue });
      await this.auditLogService.record({
        action: 'STATE_TRANSITION',
        entityType: 'StockIssue',
        entityId: id,
        beforeData: before,
        afterData: updated,
        remark: 'DRAFT -> APPROVED（仓库免审批）',
        ...this.auditCtx(before.storeId),
      });
      return updated;
    }

    await this.workflowEngineService.startInstance(
      { definitionCode: DEFINITION_CODE, businessType: BUSINESS_TYPE, businessId: id, title: before.issueNo, storeId: before.storeId },
      this.actor(),
    );
    const updated = await this.prisma.stockIssue.update({ where: { id }, data: { status: 'PENDING_APPROVAL', version: { increment: 1 } }, include: includeIssue });
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'StockIssue',
      entityId: id,
      beforeData: before,
      afterData: updated,
      remark: 'DRAFT -> PENDING_APPROVAL',
      ...this.auditCtx(before.storeId),
    });
    return updated;
  }

  async cancel(id: string, cancelReason: string, expectedVersion: number): Promise<StockIssue> {
    const before = await this.findOneOrThrow(id);
    this.assertVersion(before, expectedVersion);
    if (!['DRAFT', 'PENDING_APPROVAL', 'APPROVED'].includes(before.status)) {
      throw new BadRequestException(`出库/领用单当前状态「${before.status}」不允许取消`);
    }
    const updated = await this.prisma.stockIssue.update({
      where: { id },
      data: { status: 'CANCELLED', cancelReason, version: { increment: 1 } },
      include: includeIssue,
    });
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'StockIssue',
      entityId: id,
      beforeData: before,
      afterData: updated,
      remark: `${before.status} -> CANCELLED：${cancelReason}`,
      ...this.auditCtx(before.storeId),
    });
    return updated;
  }

  /** 执行：按 FEFO 扣减批次，WarehouseStock.quantity 扣减、avgCost 不变；unitCost 快照当前 avgCost。 */
  async execute(id: string, expectedVersion: number): Promise<StockIssue> {
    const before = await this.findOneOrThrow(id);
    this.assertVersion(before, expectedVersion);
    if (before.status !== 'APPROVED') throw new BadRequestException(`出库/领用单当前状态「${before.status}」不允许执行`);

    const issueWithItems = await this.prisma.stockIssue.findUniqueOrThrow({ where: { id }, include: { items: true } });

    const updated = await this.prisma.$transaction(async (tx) => {
      for (const line of issueWithItems.items) {
        const stock = await tx.warehouseStock.findUnique({ where: { warehouseId_itemId: { warehouseId: before.warehouseId, itemId: line.itemId } } });
        if (!stock || stock.quantity < line.quantity) {
          throw new BadRequestException(`执行时物品库存不足（可能与其他单据并发冲突），请重新核对后再试`);
        }
        await tx.warehouseStock.update({
          where: { warehouseId_itemId: { warehouseId: before.warehouseId, itemId: line.itemId } },
          data: { quantity: stock.quantity - line.quantity },
        });
        await consumeBatchesFefo(tx, before.warehouseId, line.itemId, line.quantity);
        await tx.stockIssueItem.update({ where: { id: line.id }, data: { unitCost: stock.avgCost } });
      }

      return tx.stockIssue.update({
        where: { id },
        data: { status: 'COMPLETED', completedAt: new Date(), version: { increment: 1 } },
        include: includeIssue,
      });
    });

    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'StockIssue',
      entityId: id,
      beforeData: before,
      afterData: updated,
      remark: 'APPROVED -> COMPLETED（已扣减库存与批次）',
      ...this.auditCtx(before.storeId),
    });
    return updated;
  }

  private async reconcileStatus(issue: StockIssue): Promise<StockIssue> {
    if (issue.status !== 'PENDING_APPROVAL') return issue;
    const instance = await this.prisma.workflowInstance.findFirst({
      where: { businessType: BUSINESS_TYPE, businessId: issue.id },
      orderBy: { createdAt: 'desc' },
    });
    if (!instance) return issue;

    let nextStatus: 'APPROVED' | 'REJECTED' | 'DRAFT' | null = null;
    if (instance.status === 'APPROVED' || instance.status === 'ARCHIVED') nextStatus = 'APPROVED';
    else if (instance.status === 'REJECTED') nextStatus = 'REJECTED';
    else if (instance.status === 'WITHDRAWN') nextStatus = 'DRAFT';
    if (!nextStatus) return issue;

    const updated = await this.prisma.stockIssue.update({
      where: { id: issue.id },
      data: { status: nextStatus, version: { increment: 1 } },
      include: includeIssue,
    });
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'StockIssue',
      entityId: issue.id,
      beforeData: issue,
      afterData: updated,
      remark: `PENDING_APPROVAL -> ${nextStatus}（同步自 WorkflowInstance ${instance.id}）`,
      ...this.auditCtx(issue.storeId),
    });
    return updated;
  }

  private assertVersion(before: StockIssue, expectedVersion: number): void {
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
