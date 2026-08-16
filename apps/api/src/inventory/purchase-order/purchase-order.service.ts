import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PurchaseOrder } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { ActorContext } from '../../common/context/actor-context';
import { generateBusinessNo } from '../../common/utils/business-no.util';
import { runVersionedUpdate } from '../../common/utils/versioned-update.util';
import { WorkflowEngineService } from '../../workflow/workflow-engine/workflow-engine.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { QueryPurchaseOrderDto } from './dto/query-purchase-order.dto';

const DEFINITION_CODE = 'INVENTORY_PURCHASE';
const BUSINESS_TYPE = 'PURCHASE_ORDER';
const includeOrder = { supplier: true, warehouse: true, items: { include: { item: true } } };

/**
 * 采购单(CG)：DRAFT -(提交)-> PENDING_APPROVAL -(通用工作流引擎审批)-> APPROVED/REJECTED；
 * 始终走审批，不受仓库"免审批"配置影响（花钱承诺，风险等级不同于仓内操作，见schema顶部
 * 范围收窄说明）。PENDING_APPROVAL 的后续推进由 reconcileStatus() 在读取时懒同步自
 * WorkflowInstance，与 ContractRecordService 完全同构。
 */
@Injectable()
export class PurchaseOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowEngineService: WorkflowEngineService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
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

  async create(dto: CreatePurchaseOrderDto): Promise<PurchaseOrder> {
    const itemIds = [...new Set(dto.items.map((i) => i.itemId))];
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
          remark: dto.remark,
          createdBy: this.ctx.accountId!,
        },
      });
      await tx.purchaseOrderItem.createMany({
        data: dto.items.map((i) => ({
          purchaseOrderId: order.id,
          itemId: i.itemId,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          subtotal: i.quantity * i.unitPrice,
        })),
      });
      return order;
    });
    const withItems = await this.findOneOrThrow(created.id);
    await this.auditLogService.record({ action: 'CREATE', entityType: 'PurchaseOrder', entityId: created.id, afterData: withItems, ...this.auditCtx(dto.storeId) });
    return withItems;
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
    if (!['DRAFT', 'PENDING_APPROVAL', 'APPROVED'].includes(before.status)) {
      throw new BadRequestException(`采购单当前状态「${before.status}」不允许取消`);
    }
    const updated = await runVersionedUpdate(() =>
      this.prisma.purchaseOrder.update({
        where: { id, version: expectedVersion },
        data: { status: 'CANCELLED', cancelReason, version: { increment: 1 } },
        include: includeOrder,
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
