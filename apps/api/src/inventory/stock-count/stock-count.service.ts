import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { StockCount } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { ActorContext } from '../../common/context/actor-context';
import { generateBusinessNo } from '../../common/utils/business-no.util';
import { addDays } from '../../common/utils/date.util';
import { WorkflowEngineService } from '../../workflow/workflow-engine/workflow-engine.service';
import { consumeBatchesFefo } from '../common/fefo-batch.util';
import { retryOnVersionConflict, runVersionedUpdate } from '../../common/utils/versioned-update.util';
import { CreateStockCountDto } from './dto/create-stock-count.dto';
import { QueryStockCountDto } from './dto/query-stock-count.dto';

const DEFINITION_CODE = 'INVENTORY_STOCK_COUNT';
const BUSINESS_TYPE = 'STOCK_COUNT';
const includeCount = { warehouse: true, items: { include: { item: true } } };

/**
 * 盘点单(PD)：创建时快照系统当前数量(systemQuantity)与盈亏(diffQuantity)。
 * DRAFT -(提交)-> [按仓库 requiresApproval 决定是否走工作流的"盈亏调整审批"]-> APPROVED
 * -(执行)-> COMPLETED：WarehouseStock.quantity 直接修正为盘点数，盘盈生成新批次、
 * 盘亏按FEFO消耗批次，avgCost 不变。
 */
@Injectable()
export class StockCountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowEngineService: WorkflowEngineService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
  ) {}

  async findMany(query: QueryStockCountDto = {}): Promise<StockCount[]> {
    const counts = await this.prisma.stockCount.findMany({
      where: { tenantId: this.ctx.tenantId, storeId: query.storeId, warehouseId: query.warehouseId, status: query.status },
      include: includeCount,
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(counts.map((c) => this.reconcileStatus(c)));
  }

  async findOneOrThrow(id: string): Promise<StockCount> {
    const count = await this.prisma.stockCount.findUnique({ where: { id }, include: includeCount });
    if (!count) throw new NotFoundException(`StockCount ${id} 不存在`);
    return this.reconcileStatus(count);
  }

  async create(dto: CreateStockCountDto): Promise<StockCount> {
    const itemIds = [...new Set(dto.items.map((i) => i.itemId))];
    const items = await this.prisma.inventoryItem.findMany({ where: { id: { in: itemIds } } });
    if (items.length !== itemIds.length) throw new BadRequestException('存在不存在的物品 ID');

    const created = await this.prisma.$transaction(async (tx) => {
      const count = await tx.stockCount.create({
        data: {
          tenantId: this.ctx.tenantId!,
          storeId: dto.storeId,
          warehouseId: dto.warehouseId,
          countNo: generateBusinessNo('PD'),
          remark: dto.remark,
          createdBy: this.ctx.accountId!,
        },
      });
      for (const line of dto.items) {
        const stock = await tx.warehouseStock.findUnique({ where: { warehouseId_itemId: { warehouseId: dto.warehouseId, itemId: line.itemId } } });
        const systemQuantity = stock?.quantity ?? 0;
        await tx.stockCountItem.create({
          data: {
            stockCountId: count.id,
            itemId: line.itemId,
            systemQuantity,
            countedQuantity: line.countedQuantity,
            diffQuantity: line.countedQuantity - systemQuantity,
          },
        });
      }
      return count;
    });
    const withItems = await this.findOneOrThrow(created.id);
    await this.auditLogService.record({ action: 'CREATE', entityType: 'StockCount', entityId: created.id, afterData: withItems, ...this.auditCtx(dto.storeId) });
    return withItems;
  }

  async submit(id: string, expectedVersion: number): Promise<StockCount> {
    const before = await this.findOneOrThrow(id);
    this.assertVersion(before, expectedVersion);
    if (before.status !== 'DRAFT') throw new BadRequestException(`盘点单当前状态「${before.status}」不允许提交`);

    const warehouse = await this.prisma.warehouse.findUniqueOrThrow({ where: { id: before.warehouseId } });
    if (!warehouse.requiresApproval) {
      const updated = await runVersionedUpdate(() =>
        this.prisma.stockCount.update({
          where: { id, version: expectedVersion },
          data: { status: 'APPROVED', version: { increment: 1 } },
          include: includeCount,
        }),
      );
      await this.auditLogService.record({
        action: 'STATE_TRANSITION',
        entityType: 'StockCount',
        entityId: id,
        beforeData: before,
        afterData: updated,
        remark: 'DRAFT -> APPROVED（仓库免审批）',
        ...this.auditCtx(before.storeId),
      });
      return updated;
    }

    await this.workflowEngineService.startInstance(
      { definitionCode: DEFINITION_CODE, businessType: BUSINESS_TYPE, businessId: id, title: before.countNo, storeId: before.storeId },
      this.actor(),
    );
    const updated = await runVersionedUpdate(() =>
      this.prisma.stockCount.update({
        where: { id, version: expectedVersion },
        data: { status: 'PENDING_APPROVAL', version: { increment: 1 } },
        include: includeCount,
      }),
    );
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'StockCount',
      entityId: id,
      beforeData: before,
      afterData: updated,
      remark: 'DRAFT -> PENDING_APPROVAL',
      ...this.auditCtx(before.storeId),
    });
    return updated;
  }

  async cancel(id: string, cancelReason: string, expectedVersion: number): Promise<StockCount> {
    const before = await this.findOneOrThrow(id);
    this.assertVersion(before, expectedVersion);
    if (!['DRAFT', 'PENDING_APPROVAL', 'APPROVED'].includes(before.status)) {
      throw new BadRequestException(`盘点单当前状态「${before.status}」不允许取消`);
    }
    const updated = await runVersionedUpdate(() =>
      this.prisma.stockCount.update({
        where: { id, version: expectedVersion },
        data: { status: 'CANCELLED', cancelReason, version: { increment: 1 } },
        include: includeCount,
      }),
    );
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'StockCount',
      entityId: id,
      beforeData: before,
      afterData: updated,
      remark: `${before.status} -> CANCELLED：${cancelReason}`,
      ...this.auditCtx(before.storeId),
    });
    return updated;
  }

  /** 执行：WarehouseStock.quantity 直接修正为盘点数；盘盈生成新批次，盘亏按FEFO消耗批次。 */
  async execute(id: string, expectedVersion: number): Promise<StockCount> {
    const before = await this.findOneOrThrow(id);
    this.assertVersion(before, expectedVersion);
    if (before.status !== 'APPROVED') throw new BadRequestException(`盘点单当前状态「${before.status}」不允许执行`);

    const countWithItems = await this.prisma.stockCount.findUniqueOrThrow({ where: { id }, include: { items: { include: { item: true } } } });

    // 盘点执行是把库存"设成"盘点当时数出来的绝对值，跟其它单据"基于当前值加减"不是
    // 同一种操作——version 条件这里防的是"落库时这一行已经被别的并发操作动过"，但即使
    // 检测到冲突，重试后写入的还是同一个 countedQuantity（不会重新计算），所以本质上
    // 防的是"盘点执行和盘点审批之间又有其他单据动过这个库存却被静默覆盖而不自知"，
    // 让这种情况至少以整体事务重试+更新后的 version 收尾，不比之前更差；至于"盘点期间
    // 库存被移动应不应该重新盘点"，是业务流程问题，不是这里能靠加锁解决的，留给使用流程
    // 约束（盘点单据审批到执行应尽快完成）。
    const updated = await retryOnVersionConflict(() =>
      this.prisma.$transaction(async (tx) => {
        const now = new Date();
        for (const line of countWithItems.items) {
          if (line.diffQuantity === 0) continue;
          const stock = await tx.warehouseStock.findUnique({ where: { warehouseId_itemId: { warehouseId: before.warehouseId, itemId: line.itemId } } });
          const avgCost = stock?.avgCost ?? 0;

          if (stock) {
            await tx.warehouseStock.update({
              where: { warehouseId_itemId: { warehouseId: before.warehouseId, itemId: line.itemId }, version: stock.version },
              data: { quantity: line.countedQuantity, version: { increment: 1 } },
            });
          } else {
            await tx.warehouseStock.create({
              data: { warehouseId: before.warehouseId, itemId: line.itemId, quantity: line.countedQuantity, avgCost },
            });
          }

          if (line.diffQuantity > 0) {
            await tx.stockBatch.create({
              data: {
                tenantId: this.ctx.tenantId!,
                warehouseId: before.warehouseId,
                itemId: line.itemId,
                batchNo: generateBusinessNo('BAT'),
                quantity: line.diffQuantity,
                unitCost: avgCost,
                receivedAt: now,
                expiresAt: line.item.shelfLifeDays ? addDays(now, line.item.shelfLifeDays) : null,
                sourceType: 'STOCK_COUNT',
                sourceId: before.id,
              },
            });
          } else {
            await consumeBatchesFefo(tx, before.warehouseId, line.itemId, -line.diffQuantity);
          }
        }

        return tx.stockCount.update({
          where: { id, version: expectedVersion },
          data: { status: 'COMPLETED', completedAt: now, version: { increment: 1 } },
          include: includeCount,
        });
      }),
    );

    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'StockCount',
      entityId: id,
      beforeData: before,
      afterData: updated,
      remark: 'APPROVED -> COMPLETED（已修正库存与批次）',
      ...this.auditCtx(before.storeId),
    });
    return updated;
  }

  private async reconcileStatus(count: StockCount): Promise<StockCount> {
    if (count.status !== 'PENDING_APPROVAL') return count;
    const instance = await this.prisma.workflowInstance.findFirst({
      where: { businessType: BUSINESS_TYPE, businessId: count.id },
      orderBy: { createdAt: 'desc' },
    });
    if (!instance) return count;

    let nextStatus: 'APPROVED' | 'REJECTED' | 'DRAFT' | null = null;
    if (instance.status === 'APPROVED' || instance.status === 'ARCHIVED') nextStatus = 'APPROVED';
    else if (instance.status === 'REJECTED') nextStatus = 'REJECTED';
    else if (instance.status === 'WITHDRAWN') nextStatus = 'DRAFT';
    if (!nextStatus) return count;

    const updated = await this.prisma.stockCount.update({
      where: { id: count.id },
      data: { status: nextStatus, version: { increment: 1 } },
      include: includeCount,
    });
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'StockCount',
      entityId: count.id,
      beforeData: count,
      afterData: updated,
      remark: `PENDING_APPROVAL -> ${nextStatus}（同步自 WorkflowInstance ${instance.id}）`,
      ...this.auditCtx(count.storeId),
    });
    return updated;
  }

  private assertVersion(before: StockCount, expectedVersion: number): void {
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
