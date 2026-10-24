import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PurchaseOrder } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { ActorContext } from '../../common/context/actor-context';
import { generateBusinessNo } from '../../common/utils/business-no.util';
import { runVersionedUpdate } from '../../common/utils/versioned-update.util';
import { WorkflowEngineService } from '../../workflow/workflow-engine/workflow-engine.service';
import { InventoryItemImportService, keyOf } from '../inventory-item/inventory-item-import.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { QueryPurchaseOrderDto } from './dto/query-purchase-order.dto';

const DEFINITION_CODE = 'INVENTORY_PURCHASE';
const BUSINESS_TYPE = 'PURCHASE_ORDER';
const includeOrder = {
  supplier: true,
  warehouse: true,
  items: { include: { item: true } },
  goodsReceipts: { select: { id: true, receiptNo: true, status: true, tracked: true } },
  shipments: { select: { id: true, logisticsState: true, expressNo: true } },
};

/**
 * 采购单(CG)：DRAFT -(提交)-> PENDING_APPROVAL -(通用工作流引擎审批)-> APPROVED/REJECTED；
 * 手工新建的采购单始终走审批，不受仓库"免审批"配置影响（花钱承诺，风险等级不同于仓内操作，见schema顶部
 * 范围收窄说明）。PENDING_APPROVAL 的后续推进由 reconcileStatus() 在读取时懒同步自
 * WorkflowInstance，与 ContractRecordService 完全同构。
 *
 * 申购流程生成的采购单（申购单已经过店长审批）：创建即 APPROVED（待采购），不再审批，直接交给采购员；
 * 采购员采购完点“确认采购” → PURCHASED，并自动生成“逐项收货”的入库单（见 GoodsReceiptService.receive）；
 * 货陆续到齐 → COMPLETED。
 */
@Injectable()
export class PurchaseOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowEngineService: WorkflowEngineService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
    private readonly itemImport: InventoryItemImportService,
  ) {}

  async findMany(query: QueryPurchaseOrderDto = {}): Promise<PurchaseOrder[]> {
    const orders = await this.prisma.purchaseOrder.findMany({
      where: {
        tenantId: this.ctx.tenantId,
        storeId: query.storeId,
        warehouseId: query.warehouseId,
        supplierId: query.supplierId,
        status: query.status,
      },
      include: includeOrder,
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(orders.map((o) => this.reconcileStatus(o)));
  }

  async findOneOrThrow(id: string): Promise<PurchaseOrder> {
    const order = await this.prisma.purchaseOrder.findUnique({ where: { id }, include: includeOrder });
    if (!order) throw new NotFoundException(`PurchaseOrder ${id} 不存在`);
    return this.reconcileStatus(order);
  }

  /** autoApprove：由已批准的申购单生成，直接是“待采购(APPROVED)”，不再走审批。 */
  async create(dto: CreatePurchaseOrderDto, opts: { autoApprove?: boolean } = {}): Promise<PurchaseOrder> {
    // 新物品（物品库里还没有）：先加入物品库拿到物品 id；同名同规格已经有的直接对上，不会重复建
    const newOnes = dto.items.filter((i) => !i.itemId);
    for (const [idx, i] of dto.items.entries()) {
      if (!i.itemId && !i.newItem) throw new BadRequestException(`第 ${idx + 1} 行请选择物品，或填写新物品的名称和单位`);
    }
    if (newOnes.length > 0) {
      const made = await this.itemImport.ensureItems(
        newOnes.map((i, n) => ({ rowNo: n + 1, name: i.newItem!.name, spec: i.newItem!.spec ?? null, brand: i.newItem!.brand ?? null, unit: i.newItem!.unit, referencePrice: i.unitPrice > 0 ? i.unitPrice / 100 : null })),
        { createMissing: true, purpose: 'LOGISTICS' },
      );
      for (const i of newOnes) {
        const id = made.get(keyOf(i.newItem!.name.trim(), i.newItem!.spec?.trim() || null));
        if (!id) throw new BadRequestException(`新物品「${i.newItem!.name}」没能加入物品库，请检查名称和单位`);
        i.itemId = id;
      }
    }
    const itemIds = [...new Set(dto.items.map((i) => i.itemId as string))];
    const items = await this.prisma.inventoryItem.findMany({ where: { id: { in: itemIds } } });
    if (items.length !== itemIds.length) throw new BadRequestException('存在不存在的物品 ID');

    const totalAmount = dto.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
    const created = await this.prisma.$transaction(async (tx) => {
      const order = await tx.purchaseOrder.create({
        data: {
          tenantId: this.ctx.tenantId!,
          storeId: dto.storeId,
          warehouseId: dto.warehouseId,
          supplierId: dto.supplierId,
          orderNo: generateBusinessNo('CG'),
          totalAmount,
          status: opts.autoApprove ? 'APPROVED' : undefined,
          remark: dto.remark,
          createdBy: this.ctx.accountId!,
        },
      });
      await tx.purchaseOrderItem.createMany({
        data: dto.items.map((i) => ({
          purchaseOrderId: order.id,
          itemId: i.itemId as string,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          subtotal: i.quantity * i.unitPrice,
        })),
      });
      return order;
    });
    const withItems = await this.findOneOrThrow(created.id);
    await this.auditLogService.record({
      action: 'CREATE',
      entityType: 'PurchaseOrder',
      entityId: created.id,
      afterData: withItems,
      remark: opts.autoApprove ? '由已批准的申购单生成，无需再审批，待采购员采购' : undefined,
      ...this.auditCtx(dto.storeId),
    });
    return withItems;
  }

  /**
   * 采购员确认已完成采购：采购单 APPROVED → PURCHASED，同时自动生成一张“逐项收货”的入库单（待收货），
   * 之后客服按快递到货情况逐项确认收货、入库。
   */
  async confirmPurchase(id: string, input: { expressNo?: string; note?: string }, expectedVersion: number) {
    const before = await this.findOneOrThrow(id);
    this.assertVersion(before, expectedVersion);
    if (before.status !== 'APPROVED') throw new BadRequestException(`采购单当前状态「${before.status}」不能确认采购（只有“待采购”的采购单可以）`);
    const order = await this.prisma.purchaseOrder.findUniqueOrThrow({ where: { id }, include: { items: true } });
    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.purchaseOrder.update({
        where: { id, version: expectedVersion },
        data: {
          status: 'PURCHASED',
          purchasedAt: new Date(),
          purchasedById: this.ctx.accountId!,
          expressNo: input.expressNo?.trim() || null,
          purchaseNote: input.note?.trim() || null,
          version: { increment: 1 },
        },
        include: includeOrder,
      });
      const receipt = await tx.goodsReceipt.create({
        data: {
          tenantId: this.ctx.tenantId!,
          storeId: order.storeId,
          warehouseId: order.warehouseId,
          purchaseOrderId: order.id,
          receiptNo: generateBusinessNo('RK'),
          status: 'PENDING_RECEIPT',
          tracked: true,
          remark: `由采购单 ${order.orderNo} 确认采购后自动生成，等快递到货后逐项确认收货`,
          createdBy: this.ctx.accountId!,
          items: { create: order.items.map((i) => ({ itemId: i.itemId, quantity: i.quantity, unitCost: i.unitPrice })) },
        },
      });
      return { updated, receipt };
    });
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'PurchaseOrder',
      entityId: id,
      beforeData: before,
      afterData: result.updated,
      remark: `APPROVED -> PURCHASED（采购员确认采购，已生成入库单 ${result.receipt.receiptNo}）`,
      ...this.auditCtx(before.storeId),
    });
    return { order: result.updated, receipt: result.receipt };
  }

  async submit(id: string, expectedVersion: number): Promise<PurchaseOrder> {
    const before = await this.findOneOrThrow(id);
    this.assertVersion(before, expectedVersion);
    if (before.status !== 'DRAFT') throw new BadRequestException(`采购单当前状态「${before.status}」不允许提交`);

    await this.workflowEngineService.startInstance(
      { definitionCode: DEFINITION_CODE, businessType: BUSINESS_TYPE, businessId: id, title: before.orderNo, storeId: before.storeId },
      this.actor(),
    );
    const updated = await runVersionedUpdate(() =>
      this.prisma.purchaseOrder.update({
        where: { id, version: expectedVersion },
        data: { status: 'PENDING_APPROVAL', version: { increment: 1 } },
        include: includeOrder,
      }),
    );
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'PurchaseOrder',
      entityId: id,
      beforeData: before,
      afterData: updated,
      remark: 'DRAFT -> PENDING_APPROVAL',
      ...this.auditCtx(before.storeId),
    });
    return updated;
  }

  async cancel(id: string, cancelReason: string, expectedVersion: number): Promise<PurchaseOrder> {
    const before = await this.findOneOrThrow(id);
    this.assertVersion(before, expectedVersion);
    if (!['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PURCHASED'].includes(before.status)) {
      throw new BadRequestException(`采购单当前状态「${before.status}」不允许取消`);
    }
    if (before.status === 'PURCHASED') {
      const received = await this.prisma.goodsReceiptItem.aggregate({ where: { goodsReceipt: { purchaseOrderId: id, tracked: true } }, _sum: { receivedQuantity: true } });
      if ((received._sum.receivedQuantity ?? 0) > 0) throw new BadRequestException('已经有货品到货入库，不能取消采购单');
    }
    const updated = await runVersionedUpdate(() =>
      this.prisma.$transaction(async (tx) => {
        await tx.goodsReceipt.updateMany({ where: { purchaseOrderId: id, tracked: true, status: { in: ['PENDING_RECEIPT'] } }, data: { status: 'CANCELLED', cancelReason: `采购单已取消：${cancelReason}` } });
        return tx.purchaseOrder.update({
          where: { id, version: expectedVersion },
          data: { status: 'CANCELLED', cancelReason, version: { increment: 1 } },
          include: includeOrder,
        });
      }),
    );
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'PurchaseOrder',
      entityId: id,
      beforeData: before,
      afterData: updated,
      remark: `${before.status} -> CANCELLED：${cancelReason}`,
      ...this.auditCtx(before.storeId),
    });
    return updated;
  }

  /** 只要采购单还停在 PENDING_APPROVAL，就查一下挂在它身上的 WorkflowInstance，按其终态推进。 */
  private async reconcileStatus(order: PurchaseOrder & { items?: unknown }): Promise<PurchaseOrder> {
    if (order.status !== 'PENDING_APPROVAL') return order as PurchaseOrder;
    const instance = await this.prisma.workflowInstance.findFirst({
      where: { businessType: BUSINESS_TYPE, businessId: order.id },
      orderBy: { createdAt: 'desc' },
    });
    if (!instance) return order as PurchaseOrder;

    let nextStatus: 'APPROVED' | 'REJECTED' | 'DRAFT' | null = null;
    if (instance.status === 'APPROVED' || instance.status === 'ARCHIVED') nextStatus = 'APPROVED';
    else if (instance.status === 'REJECTED') nextStatus = 'REJECTED';
    else if (instance.status === 'WITHDRAWN') nextStatus = 'DRAFT';
    if (!nextStatus) return order as PurchaseOrder;

    const updated = await this.prisma.purchaseOrder.update({
      where: { id: order.id },
      data: { status: nextStatus, version: { increment: 1 } },
      include: includeOrder,
    });
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'PurchaseOrder',
      entityId: order.id,
      beforeData: order,
      afterData: updated,
      remark: `PENDING_APPROVAL -> ${nextStatus}（同步自 WorkflowInstance ${instance.id}）`,
      ...this.auditCtx(order.storeId),
    });
    return updated;
  }

  private assertVersion(before: PurchaseOrder, expectedVersion: number): void {
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
