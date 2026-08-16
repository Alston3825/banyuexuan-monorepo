import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StockTransfer } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { ActorContext } from '../../common/context/actor-context';
import { generateBusinessNo } from '../../common/utils/business-no.util';
import { WorkflowEngineService } from '../../workflow/workflow-engine/workflow-engine.service';
import { consumeBatchesFefo } from '../common/fefo-batch.util';
import { retryOnVersionConflict, runVersionedUpdate } from '../../common/utils/versioned-update.util';
import { CreateStockTransferDto } from './dto/create-stock-transfer.dto';
import { QueryStockTransferDto } from './dto/query-stock-transfer.dto';

const DEFINITION_CODE = 'INVENTORY_STOCK_TRANSFER';
const BUSINESS_TYPE = 'STOCK_TRANSFER';
const includeTransfer = { fromWarehouse: true, toWarehouse: true, items: { include: { item: true } } };

/**
 * 调拨单(DB，含跨店)：以源仓库(fromWarehouse)的 requiresApproval 配置决定是否需要审批
 * （源头承担库存流出风险，见schema顶部范围收窄说明）。执行时源仓库按 FEFO 扣减、批次
 * "搬家"到目标仓库（沿用原 expiresAt，receivedAt 记为执行时刻），目标仓库按移动加权
 * 平均法用源仓库执行前的 avgCost 重算成本。
 */
@Injectable()
export class StockTransferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowEngineService: WorkflowEngineService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
  ) {}

  async findMany(query: QueryStockTransferDto = {}): Promise<StockTransfer[]> {
    const transfers = await this.prisma.stockTransfer.findMany({
      where: { tenantId: this.ctx.tenantId, fromWarehouseId: query.fromWarehouseId, toWarehouseId: query.toWarehouseId, status: query.status },
      include: includeTransfer,
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(transfers.map((t) => this.reconcileStatus(t)));
  }

  async findOneOrThrow(id: string): Promise<StockTransfer> {
    const transfer = await this.prisma.stockTransfer.findUnique({ where: { id }, include: includeTransfer });
    if (!transfer) throw new NotFoundException(`StockTransfer ${id} 不存在`);
    return this.reconcileStatus(transfer);
  }

  async create(dto: CreateStockTransferDto): Promise<StockTransfer> {
    if (dto.fromWarehouseId === dto.toWarehouseId) throw new BadRequestException('调出仓库与调入仓库不能相同');
    const itemIds = [...new Set(dto.items.map((i) => i.itemId))];
    const items = await this.prisma.inventoryItem.findMany({ where: { id: { in: itemIds } } });
    if (items.length !== itemIds.length) throw new BadRequestException('存在不存在的物品 ID');

    for (const line of dto.items) {
      const stock = await this.prisma.warehouseStock.findUnique({ where: { warehouseId_itemId: { warehouseId: dto.fromWarehouseId, itemId: line.itemId } } });
      if (!stock || stock.quantity < line.quantity) {
        const item = items.find((it) => it.id === line.itemId)!;
        throw new BadRequestException(`物品「${item.name}」在调出仓库的库存不足（现有 ${stock?.quantity ?? 0}，需要 ${line.quantity}）`);
      }
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const transfer = await tx.stockTransfer.create({
        data: {
          tenantId: this.ctx.tenantId!,
          fromWarehouseId: dto.fromWarehouseId,
          toWarehouseId: dto.toWarehouseId,
          transferNo: generateBusinessNo('DB'),
          remark: dto.remark,
          createdBy: this.ctx.accountId!,
        },
      });
      await tx.stockTransferItem.createMany({ data: dto.items.map((i) => ({ stockTransferId: transfer.id, itemId: i.itemId, quantity: i.quantity })) });
      return transfer;
    });
    const withItems = await this.findOneOrThrow(created.id);
    await this.auditLogService.record({ action: 'CREATE', entityType: 'StockTransfer', entityId: created.id, afterData: withItems, ...(await this.auditCtx(created.fromWarehouseId)) });
    return withItems;
  }

  async submit(id: string, expectedVersion: number): Promise<StockTransfer> {
    const before = await this.findOneOrThrow(id);
    this.assertVersion(before, expectedVersion);
    if (before.status !== 'DRAFT') throw new BadRequestException(`调拨单当前状态「${before.status}」不允许提交`);

    const fromWarehouse = await this.prisma.warehouse.findUniqueOrThrow({ where: { id: before.fromWarehouseId } });
    if (!fromWarehouse.requiresApproval) {
      const updated = await runVersionedUpdate(() =>
        this.prisma.stockTransfer.update({
          where: { id, version: expectedVersion },
          data: { status: 'APPROVED', version: { increment: 1 } },
          include: includeTransfer,
        }),
      );
      await this.auditLogService.record({
        action: 'STATE_TRANSITION',
        entityType: 'StockTransfer',
        entityId: id,
        beforeData: before,
        afterData: updated,
        remark: 'DRAFT -> APPROVED（源仓库免审批）',
        ...(await this.auditCtx(before.fromWarehouseId)),
      });
      return updated;
    }

    await this.workflowEngineService.startInstance(
      { definitionCode: DEFINITION_CODE, businessType: BUSINESS_TYPE, businessId: id, title: before.transferNo, storeId: fromWarehouse.storeId },
      this.actor(),
    );
    const updated = await runVersionedUpdate(() =>
      this.prisma.stockTransfer.update({
        where: { id, version: expectedVersion },
        data: { status: 'PENDING_APPROVAL', version: { increment: 1 } },
        include: includeTransfer,
      }),
    );
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'StockTransfer',
      entityId: id,
      beforeData: before,
      afterData: updated,
      remark: 'DRAFT -> PENDING_APPROVAL',
      ...(await this.auditCtx(before.fromWarehouseId)),
    });
    return updated;
  }

  async cancel(id: string, cancelReason: string, expectedVersion: number): Promise<StockTransfer> {
    const before = await this.findOneOrThrow(id);
    this.assertVersion(before, expectedVersion);
    if (!['DRAFT', 'PENDING_APPROVAL', 'APPROVED'].includes(before.status)) {
      throw new BadRequestException(`调拨单当前状态「${before.status}」不允许取消`);
    }
    const updated = await runVersionedUpdate(() =>
      this.prisma.stockTransfer.update({
        where: { id, version: expectedVersion },
        data: { status: 'CANCELLED', cancelReason, version: { increment: 1 } },
        include: includeTransfer,
      }),
    );
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'StockTransfer',
      entityId: id,
      beforeData: before,
      afterData: updated,
      remark: `${before.status} -> CANCELLED：${cancelReason}`,
      ...(await this.auditCtx(before.fromWarehouseId)),
    });
    return updated;
  }

  async execute(id: string, expectedVersion: number): Promise<StockTransfer> {
    const before = await this.findOneOrThrow(id);
    this.assertVersion(before, expectedVersion);
    if (before.status !== 'APPROVED') throw new BadRequestException(`调拨单当前状态「${before.status}」不允许执行`);

    const transferWithItems = await this.prisma.stockTransfer.findUniqueOrThrow({ where: { id }, include: { items: true } });

    // 整个事务包一层重试，理由同 GoodsReceiptService.execute()：源仓库扣减/目标仓库
    // 移动加权平均成本重算都依赖"读当前值再算"，且事务是全有全无的，回滚后要重新从头
    // 读所有行的最新库存再算一遍，不能只重试出问题的那一行。
    const updated = await retryOnVersionConflict(() =>
      this.prisma.$transaction(async (tx) => {
        const now = new Date();
        for (const line of transferWithItems.items) {
          const fromStock = await tx.warehouseStock.findUnique({ where: { warehouseId_itemId: { warehouseId: before.fromWarehouseId, itemId: line.itemId } } });
          if (!fromStock || fromStock.quantity < line.quantity) {
            throw new BadRequestException('执行时调出仓库库存不足（可能与其他单据并发冲突），请重新核对后再试');
          }
          const transferUnitCost = fromStock.avgCost;

          // 源仓库：扣减量是单据上写死的，原子 decrement + 下限 where 足够，不需要重算。
          try {
            await tx.warehouseStock.update({
              where: { warehouseId_itemId: { warehouseId: before.fromWarehouseId, itemId: line.itemId }, quantity: { gte: line.quantity } },
              data: { quantity: { decrement: line.quantity } },
            });
          } catch (err) {
            if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
              throw new BadRequestException('执行时调出仓库库存不足（可能与其他单据并发冲突），请重新核对后再试');
            }
            throw err;
          }
          const consumedBatches = await consumeBatchesFefo(tx, before.fromWarehouseId, line.itemId, line.quantity);

          // 目标仓库：avgCost 要基于当前值重新计算，用带 version 条件的写回，落库失败
          // （P2025/P2002）会被最外层 retryOnVersionConflict 捕获、整个事务重试。
          const toStock = await tx.warehouseStock.findUnique({ where: { warehouseId_itemId: { warehouseId: before.toWarehouseId, itemId: line.itemId } } });
          const oldToQuantity = toStock?.quantity ?? 0;
          const oldToAvgCost = toStock?.avgCost ?? 0;
          const newToQuantity = oldToQuantity + line.quantity;
          const newToAvgCost = newToQuantity === 0 ? 0 : Math.round((oldToQuantity * oldToAvgCost + line.quantity * transferUnitCost) / newToQuantity);
          if (toStock) {
            await tx.warehouseStock.update({
              where: { warehouseId_itemId: { warehouseId: before.toWarehouseId, itemId: line.itemId }, version: toStock.version },
              data: { quantity: newToQuantity, avgCost: newToAvgCost, version: { increment: 1 } },
            });
          } else {
            await tx.warehouseStock.create({
              data: { warehouseId: before.toWarehouseId, itemId: line.itemId, quantity: newToQuantity, avgCost: newToAvgCost },
            });
          }

          for (const consumed of consumedBatches) {
            await tx.stockBatch.create({
              data: {
                tenantId: this.ctx.tenantId!,
                warehouseId: before.toWarehouseId,
                itemId: line.itemId,
                batchNo: generateBusinessNo('BAT'),
                quantity: consumed.quantity,
                unitCost: consumed.unitCost,
                receivedAt: now,
                expiresAt: consumed.expiresAt,
                sourceType: 'STOCK_TRANSFER',
                sourceId: before.id,
              },
            });
          }
        }

        return tx.stockTransfer.update({
          where: { id, version: expectedVersion },
          data: { status: 'COMPLETED', completedAt: now, version: { increment: 1 } },
          include: includeTransfer,
        });
      }),
    );

    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'StockTransfer',
      entityId: id,
      beforeData: before,
      afterData: updated,
      remark: 'APPROVED -> COMPLETED（已完成库存与批次搬家）',
      ...(await this.auditCtx(before.fromWarehouseId)),
    });
    return updated;
  }

  private async reconcileStatus(transfer: StockTransfer): Promise<StockTransfer> {
    if (transfer.status !== 'PENDING_APPROVAL') return transfer;
    const instance = await this.prisma.workflowInstance.findFirst({
      where: { businessType: BUSINESS_TYPE, businessId: transfer.id },
      orderBy: { createdAt: 'desc' },
    });
    if (!instance) return transfer;

    let nextStatus: 'APPROVED' | 'REJECTED' | 'DRAFT' | null = null;
    if (instance.status === 'APPROVED' || instance.status === 'ARCHIVED') nextStatus = 'APPROVED';
    else if (instance.status === 'REJECTED') nextStatus = 'REJECTED';
    else if (instance.status === 'WITHDRAWN') nextStatus = 'DRAFT';
    if (!nextStatus) return transfer;

    const updated = await this.prisma.stockTransfer.update({
      where: { id: transfer.id },
      data: { status: nextStatus, version: { increment: 1 } },
      include: includeTransfer,
    });
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'StockTransfer',
      entityId: transfer.id,
      beforeData: transfer,
      afterData: updated,
      remark: `PENDING_APPROVAL -> ${nextStatus}（同步自 WorkflowInstance ${instance.id}）`,
      ...(await this.auditCtx(transfer.fromWarehouseId)),
    });
    return updated;
  }

  private assertVersion(before: StockTransfer, expectedVersion: number): void {
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

  /** 调拨单没有直接的 storeId 字段，审计日志的门店归属取"源仓库"所属门店。 */
  private async auditCtx(fromWarehouseId: string) {
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id: fromWarehouseId } });
    return {
      tenantId: this.ctx.tenantId,
      storeId: warehouse?.storeId,
      accountId: this.ctx.accountId,
      ip: this.ctx.ip,
      userAgent: this.ctx.userAgent,
      requestId: this.ctx.requestId,
    };
  }
}
