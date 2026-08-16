import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { GoodsReceipt } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { ActorContext } from '../../common/context/actor-context';
import { generateBusinessNo } from '../../common/utils/business-no.util';
import { addDays } from '../../common/utils/date.util';
import { retryOnVersionConflict, runVersionedUpdate } from '../../common/utils/versioned-update.util';
import { WorkflowEngineService } from '../../workflow/workflow-engine/workflow-engine.service';
import { CreateGoodsReceiptDto } from './dto/create-goods-receipt.dto';
import { QueryGoodsReceiptDto } from './dto/query-goods-receipt.dto';

const DEFINITION_CODE = 'INVENTORY_GOODS_RECEIPT';
const BUSINESS_TYPE = 'GOODS_RECEIPT';
const includeReceipt = { warehouse: true, purchaseOrder: true, items: { include: { item: true } } };

/**
 * 入库单(RK)：DRAFT -(提交)-> [挂在已审批采购单下则直接跳过审批 / 否则按仓库
 * requiresApproval 决定是否走工作流]-> APPROVED -(执行 execute)-> COMPLETED
 * （更新 WarehouseStock 移动加权平均成本 + 生成 StockBatch）。COMPLETED 后不可变，
 * 冲正需另开一张出库单反向操作，不修改本单据。PENDING_APPROVAL 的推进由 reconcileStatus()
 * 懒同步自 WorkflowInstance，与 ContractRecordService 同构。
 */
@Injectable()
export class GoodsReceiptService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowEngineService: WorkflowEngineService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
  ) {}

  async findMany(query: QueryGoodsReceiptDto = {}): Promise<GoodsReceipt[]> {
    const receipts = await this.prisma.goodsReceipt.findMany({
      where: { tenantId: this.ctx.tenantId, storeId: query.storeId, warehouseId: query.warehouseId, status: query.status },
      include: includeReceipt,
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(receipts.map((r) => this.reconcileStatus(r)));
  }

  async findOneOrThrow(id: string): Promise<GoodsReceipt> {
    const receipt = await this.prisma.goodsReceipt.findUnique({ where: { id }, include: includeReceipt });
    if (!receipt) throw new NotFoundException(`GoodsReceipt ${id} 不存在`);
    return this.reconcileStatus(receipt);
  }

  async create(dto: CreateGoodsReceiptDto): Promise<GoodsReceipt> {
    const itemIds = [...new Set(dto.items.map((i) => i.itemId))];
    const items = await this.prisma.inventoryItem.findMany({ where: { id: { in: itemIds } } });
    if (items.length !== itemIds.length) throw new BadRequestException('存在不存在的物品 ID');

    if (dto.purchaseOrderId) {
      const po = await this.prisma.purchaseOrder.findUnique({ where: { id: dto.purchaseOrderId } });
      if (!po) throw new NotFoundException(`PurchaseOrder ${dto.purchaseOrderId} 不存在`);
      if (po.status !== 'APPROVED') throw new BadRequestException('只能对已审批通过的采购单登记入库');
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const receipt = await tx.goodsReceipt.create({
        data: {
          tenantId: this.ctx.tenantId!,
          storeId: dto.storeId,
          warehouseId: dto.warehouseId,
          purchaseOrderId: dto.purchaseOrderId,
          receiptNo: generateBusinessNo('RK'),
          remark: dto.remark,
          createdBy: this.ctx.accountId!,
        },
      });
      await tx.goodsReceiptItem.createMany({
        data: dto.items.map((i) => ({ goodsReceiptId: receipt.id, itemId: i.itemId, quantity: i.quantity, unitCost: i.unitCost })),
      });
      return receipt;
    });
    const withItems = await this.findOneOrThrow(created.id);
    await this.auditLogService.record({ action: 'CREATE', entityType: 'GoodsReceipt', entityId: created.id, afterData: withItems, ...this.auditCtx(dto.storeId) });
    return withItems;
  }

  async submit(id: string, expectedVersion: number): Promise<GoodsReceipt> {
    const before = await this.findOneOrThrow(id);
    this.assertVersion(before, expectedVersion);
    if (before.status !== 'DRAFT') throw new BadRequestException(`入库单当前状态「${before.status}」不允许提交`);

    if (before.purchaseOrderId) {
      const updated = await runVersionedUpdate(() =>
        this.prisma.goodsReceipt.update({
          where: { id, version: expectedVersion },
          data: { status: 'APPROVED', version: { increment: 1 } },
          include: includeReceipt,
        }),
      );
      await this.auditLogService.record({
        action: 'STATE_TRANSITION',
        entityType: 'GoodsReceipt',
        entityId: id,
        beforeData: before,
        afterData: updated,
        remark: 'DRAFT -> APPROVED（挂在已审批采购单下，跳过自身审批）',
        ...this.auditCtx(before.storeId),
      });
      return updated;
    }

    const warehouse = await this.prisma.warehouse.findUniqueOrThrow({ where: { id: before.warehouseId } });
    if (!warehouse.requiresApproval) {
      const updated = await runVersionedUpdate(() =>
        this.prisma.goodsReceipt.update({
          where: { id, version: expectedVersion },
          data: { status: 'APPROVED', version: { increment: 1 } },
          include: includeReceipt,
        }),
      );
      await this.auditLogService.record({
        action: 'STATE_TRANSITION',
        entityType: 'GoodsReceipt',
        entityId: id,
        beforeData: before,
        afterData: updated,
        remark: 'DRAFT -> APPROVED（仓库免审批）',
        ...this.auditCtx(before.storeId),
      });
      return updated;
    }

    await this.workflowEngineService.startInstance(
      { definitionCode: DEFINITION_CODE, businessType: BUSINESS_TYPE, businessId: id, title: before.receiptNo, storeId: before.storeId },
      this.actor(),
    );
    const updated = await runVersionedUpdate(() =>
      this.prisma.goodsReceipt.update({
        where: { id, version: expectedVersion },
        data: { status: 'PENDING_APPROVAL', version: { increment: 1 } },
        include: includeReceipt,
      }),
    );
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'GoodsReceipt',
      entityId: id,
      beforeData: before,
      afterData: updated,
      remark: 'DRAFT -> PENDING_APPROVAL',
      ...this.auditCtx(before.storeId),
    });
    return updated;
  }

  async cancel(id: string, cancelReason: string, expectedVersion: number): Promise<GoodsReceipt> {
    const before = await this.findOneOrThrow(id);
    this.assertVersion(before, expectedVersion);
    if (!['DRAFT', 'PENDING_APPROVAL', 'APPROVED'].includes(before.status)) {
      throw new BadRequestException(`入库单当前状态「${before.status}」不允许取消`);
    }
    const updated = await runVersionedUpdate(() =>
      this.prisma.goodsReceipt.update({
        where: { id, version: expectedVersion },
        data: { status: 'CANCELLED', cancelReason, version: { increment: 1 } },
        include: includeReceipt,
      }),
    );
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'GoodsReceipt',
      entityId: id,
      beforeData: before,
      afterData: updated,
      remark: `${before.status} -> CANCELLED：${cancelReason}`,
      ...this.auditCtx(before.storeId),
    });
    return updated;
  }

  /** 执行：更新 WarehouseStock（移动加权平均法）并按物品保质期天数生成 StockBatch。 */
  async execute(id: string, expectedVersion: number): Promise<GoodsReceipt> {
    const before = await this.findOneOrThrow(id);
    this.assertVersion(before, expectedVersion);
    if (before.status !== 'APPROVED') throw new BadRequestException(`入库单当前状态「${before.status}」不允许执行`);

    const receiptWithItems = await this.prisma.goodsReceipt.findUniqueOrThrow({ where: { id }, include: { items: { include: { item: true } } } });

    // 整个事务包一层重试：一旦任意一行的 WarehouseStock 落库时发现被并发改过（P2025/P2002），
    // Prisma 事务整体回滚，重新从头读取所有行的最新库存再算一遍——不能只重试出问题的那一行，
    // 因为事务是全有全无的，回滚后之前几行"看似已生效"的改动其实也已经撤销了。
    const updated = await retryOnVersionConflict(() =>
      this.prisma.$transaction(async (tx) => {
        const now = new Date();
        for (const line of receiptWithItems.items) {
          const existing = await tx.warehouseStock.findUnique({
            where: { warehouseId_itemId: { warehouseId: before.warehouseId, itemId: line.itemId } },
          });
          const oldQuantity = existing?.quantity ?? 0;
          const oldAvgCost = existing?.avgCost ?? 0;
          const newQuantity = oldQuantity + line.quantity;
          const newAvgCost = newQuantity === 0 ? 0 : Math.round((oldQuantity * oldAvgCost + line.quantity * line.unitCost) / newQuantity);

          if (existing) {
            await tx.warehouseStock.update({
              where: { warehouseId_itemId: { warehouseId: before.warehouseId, itemId: line.itemId }, version: existing.version },
              data: { quantity: newQuantity, avgCost: newAvgCost, version: { increment: 1 } },
            });
          } else {
            await tx.warehouseStock.create({
              data: { warehouseId: before.warehouseId, itemId: line.itemId, quantity: newQuantity, avgCost: newAvgCost },
            });
          }

          await tx.stockBatch.create({
            data: {
              tenantId: this.ctx.tenantId!,
              warehouseId: before.warehouseId,
              itemId: line.itemId,
              batchNo: generateBusinessNo('BAT'),
              quantity: line.quantity,
              unitCost: line.unitCost,
              receivedAt: now,
              expiresAt: line.item.shelfLifeDays ? addDays(now, line.item.shelfLifeDays) : null,
              sourceType: 'GOODS_RECEIPT',
              sourceId: before.id,
            },
          });
        }

        return tx.goodsReceipt.update({
          where: { id },
          data: { status: 'COMPLETED', completedAt: now, version: { increment: 1 } },
          include: includeReceipt,
        });
      }),
    );

    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'GoodsReceipt',
      entityId: id,
      beforeData: before,
      afterData: updated,
      remark: 'APPROVED -> COMPLETED（已更新库存与批次）',
      ...this.auditCtx(before.storeId),
    });
    return updated;
  }

  /** 只要入库单还停在 PENDING_APPROVAL，就查一下挂在它身上的 WorkflowInstance，按其终态推进。 */
  private async reconcileStatus(receipt: GoodsReceipt): Promise<GoodsReceipt> {
    if (receipt.status !== 'PENDING_APPROVAL') return receipt;
    const instance = await this.prisma.workflowInstance.findFirst({
      where: { businessType: BUSINESS_TYPE, businessId: receipt.id },
      orderBy: { createdAt: 'desc' },
    });
    if (!instance) return receipt;

    let nextStatus: 'APPROVED' | 'REJECTED' | 'DRAFT' | null = null;
    if (instance.status === 'APPROVED' || instance.status === 'ARCHIVED') nextStatus = 'APPROVED';
    else if (instance.status === 'REJECTED') nextStatus = 'REJECTED';
    else if (instance.status === 'WITHDRAWN') nextStatus = 'DRAFT';
    if (!nextStatus) return receipt;

    const updated = await this.prisma.goodsReceipt.update({
      where: { id: receipt.id },
      data: { status: nextStatus, version: { increment: 1 } },
      include: includeReceipt,
    });
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'GoodsReceipt',
      entityId: receipt.id,
      beforeData: receipt,
      afterData: updated,
      remark: `PENDING_APPROVAL -> ${nextStatus}（同步自 WorkflowInstance ${instance.id}）`,
      ...this.auditCtx(receipt.storeId),
    });
    return updated;
  }

  private assertVersion(before: GoodsReceipt, expectedVersion: number): void {
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
