import { nextFreeCodes } from './inventory-item-import.service';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InventoryItem, WarehousePurpose } from '@prisma/client';
import { itemMatchesKeyword } from '../common/item-match';
import { nameSimilarity, normName } from '../common/item-similarity';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { BaseScopedCrudService } from '../../common/base/base-scoped-crud.service';

/** 物品：租户全局主数据，不做门店范围过滤（与其余主数据口径一致）。 */
@Injectable()
export class InventoryItemService extends BaseScopedCrudService<InventoryItem> {
  protected readonly entityType = 'InventoryItem';

  constructor(
    private readonly prisma: PrismaService,
    auditLogService: AuditLogService,
    ctx: RequestContextService,
  ) {
    super(auditLogService, ctx);
  }

  protected get delegate() {
    return this.prisma.inventoryItem;
  }

  findMany(): Promise<InventoryItem[]> {
    return this.prisma.inventoryItem.findMany({ where: { tenantId: this.ctx.tenantId }, orderBy: { createdAt: 'desc' } });
  }

  async search(keyword?: string) {
    const all = await this.prisma.inventoryItem.findMany({
      where: { tenantId: this.ctx.tenantId, status: 'ACTIVE' },
      select: { id: true, code: true, name: true, spec: true, brand: true, category: true, unit: true, referencePrice: true },
      orderBy: [{ name: 'asc' }],
      take: 5000,
    });
    // 名称/规格/品牌/编码 + 拼音（全拼/首字母）在内存里匹配，最多返回 30 条
    return all.filter((i) => itemMatchesKeyword(i, keyword)).slice(0, 30);
  }

  /**
   * 新物品入库前查重：和物品库里已有的物品比名称，返回相似的（最多 5 个）。
   * exact = 名称和规格都一样（可以直接用已有的，不用问人）；其余相似的要人工确认是合并还是新增。
   */
  async similar(name?: string, spec?: string) {
    const n = (name ?? '').trim();
    if (!n) return [];
    const all = await this.prisma.inventoryItem.findMany({
      where: { tenantId: this.ctx.tenantId },
      select: { id: true, code: true, name: true, spec: true, brand: true, unit: true, status: true },
      take: 5000,
    });
    return all
      .map((i) => ({ ...i, score: nameSimilarity(n, i.name) }))
      .filter((i) => i.score >= 0.6)
      .map((i) => ({ ...i, exact: normName(i.name) === normName(n) && normName(i.spec) === normName(spec) }))
      .sort((a, b) => Number(b.exact) - Number(a.exact) || b.score - a.score)
      .slice(0, 5);
  }

  /** 下一个自动编码：WP0001、WP0002……（取现有最大号 +1） */
  private async nextCode(): Promise<string> {
    const rows = await this.prisma.inventoryItem.findMany({ where: { tenantId: this.ctx.tenantId }, select: { code: true } });
    return nextFreeCodes(rows, 1)[0];
  }

  async create(data: {
    code?: string;
    name: string;
    unit: string;
    category?: string;
    purpose?: WarehousePurpose;
    spec?: string;
    brand?: string;
    referencePrice?: number;
    safetyStockThreshold?: number;
    shelfLifeDays?: number;
  }) {
    const base = { ...data, spec: data.spec?.trim() || undefined, brand: data.brand?.trim() || undefined, tenantId: this.ctx.tenantId };
    if (data.code?.trim()) return super.create({ ...base, code: data.code.trim() });
    // 没填编码：自动编；两个人同时新建撞了号就换下一个号再试一次
    try {
      return await super.create({ ...base, code: await this.nextCode() });
    } catch (e) {
      if ((e as { code?: string }).code !== 'P2002') throw e;
      return super.create({ ...base, code: await this.nextCode() });
    }
  }

  /** 规格/品牌传空字符串 = 清空（存成 null） */
  update(id: string, data: Record<string, unknown>, expectedVersion: number) {
    const cleaned = { ...data };
    for (const k of ['spec', 'brand', 'category'] as const) {
      if (typeof cleaned[k] === 'string') cleaned[k] = (cleaned[k] as string).trim() || null;
    }
    if (typeof cleaned.unit === 'string') {
      cleaned.unit = cleaned.unit.trim();
      if (!cleaned.unit) throw new BadRequestException('计量单位不能为空');
    }
    return super.update(id, cleaned, expectedVersion);
  }
  /**
   * 删除前检查：看这个物品有没有库存、有没有出现在单据里，决定能怎么删。
   * - 没库存、没任何单据/批次记录：直接删除（DELETE）。
   * - 没库存，但有记录：只能隐藏（HIDE，状态改“停用”，搜索/选物品时不再出现，历史单据照常显示，随时可在编辑里恢复）。
   * - 还有库存：库管不能删（BLOCKED，先出库或盘点清零）；有 inventory.item.force-delete 的管理员可以隐藏。
   */
  async deleteCheck(id: string) {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id, tenantId: this.ctx.tenantId },
      include: { _count: { select: { batches: true, purchaseOrderItems: true, purchaseRequestItems: true, goodsReceiptItems: true, stockIssueItems: true, stockTransferItems: true, stockCountItems: true } } },
    });
    if (!item) throw new NotFoundException('物品不存在');
    const stock = await this.prisma.warehouseStock.aggregate({ where: { itemId: id }, _sum: { quantity: true } });
    const stockQty = stock._sum.quantity ?? 0;
    const recordCount = Object.values(item._count).reduce((a, b) => a + b, 0);
    const canForce = await this.ctx.hasPermission('inventory.item.force-delete');
    let outcome: 'DELETE' | 'HIDE' | 'BLOCKED';
    let reason: string;
    if (stockQty > 0) {
      outcome = canForce ? 'HIDE' : 'BLOCKED';
      reason = canForce
        ? `这个物品还有库存 ${stockQty}${item.unit}，且有历史记录，删除只会隐藏（库存数据保留，随时可恢复）。`
        : `这个物品还有库存 ${stockQty}${item.unit}，不能删除。请先出库或盘点清零；如果只是暂时不用，可以在“编辑”里改成“停用”。`;
    } else if (recordCount > 0) {
      outcome = 'HIDE';
      reason = `这个物品已有 ${recordCount} 条单据/批次记录，删除只会隐藏（历史单据照常显示，随时可在“编辑”里恢复）。`;
    } else {
      outcome = 'DELETE';
      reason = '这个物品没有库存也没有任何记录，将永久删除。';
    }
    return { item, stockQty, recordCount, outcome, reason };
  }

  async remove(id: string): Promise<{ outcome: 'DELETED' | 'HIDDEN'; message: string }> {
    const check = await this.deleteCheck(id);
    if (check.outcome === 'BLOCKED') throw new BadRequestException(check.reason);
    if (check.outcome === 'HIDE') {
      if (check.item.status !== 'INACTIVE') {
        const after = await this.prisma.inventoryItem.update({ where: { id }, data: { status: 'INACTIVE', version: { increment: 1 } } });
        await this.auditLogService.record({ action: 'UPDATE', entityType: this.entityType, entityId: id, beforeData: check.item, afterData: after, remark: '删除物品（有记录，仅隐藏）', ...this.auditContext() });
      }
      return { outcome: 'HIDDEN', message: `已隐藏“${check.item.name}”（有历史记录，未真正删除；需要时可在“编辑”里恢复为启用）` };
    }
    await this.prisma.$transaction([
      this.prisma.warehouseStock.deleteMany({ where: { itemId: id } }),
      this.prisma.inventoryItem.delete({ where: { id } }),
    ]);
    await this.auditLogService.record({ action: 'DELETE', entityType: this.entityType, entityId: id, beforeData: check.item, remark: '删除物品（无库存无记录）', ...this.auditContext() });
    return { outcome: 'DELETED', message: `已删除“${check.item.name}”` };
  }
  /**
   * 采购价格记录：这个物品每一次入库的日期、入库单/采购单号、供应商、数量和当次实际单价（分），新的在前。
   * 同一物品不同时间价格不同，各批次按各自单价入账；这里就是查“某一批当时实际花了多少钱”的地方。
   */
  async priceHistory(id: string) {
    if (!(await this.ctx.hasPermission('inventory.item.view')) && !(await this.ctx.hasPermission('inventory.warehouse-stock.view')) && !(await this.ctx.hasPermission('inventory.purchase-order.view'))) {
      throw new ForbiddenException('没有查看采购价格的权限');
    }
    const item = await this.prisma.inventoryItem.findFirst({ where: { id, tenantId: this.ctx.tenantId }, select: { id: true, name: true, spec: true, unit: true } });
    if (!item) throw new NotFoundException('物品不存在');
    const receiptSelect = { id: true, receiptNo: true, tracked: true, completedAt: true, createdAt: true, warehouse: { select: { name: true } }, purchaseOrder: { select: { orderNo: true, supplier: { select: { name: true } } } } } as const;
    // 逐项收货的入库单：每次到货确认一条
    const confirmLines = await this.prisma.goodsReceiptConfirmationLine.findMany({
      where: { receiptItem: { itemId: id, goodsReceipt: { tenantId: this.ctx.tenantId } } },
      include: { confirmation: { select: { confirmedAt: true } }, receiptItem: { select: { unitCost: true, goodsReceipt: { select: receiptSelect } } } },
    });
    // 老的手工入库单：执行入库（COMPLETED）后整张入账
    const legacy = await this.prisma.goodsReceiptItem.findMany({
      where: { itemId: id, goodsReceipt: { tenantId: this.ctx.tenantId, tracked: false, status: 'COMPLETED' } },
      include: { goodsReceipt: { select: receiptSelect } },
    });
    const rows = [
      ...confirmLines.map((l) => ({ date: l.confirmation.confirmedAt, quantity: l.quantity, unitCost: l.receiptItem.unitCost, receipt: l.receiptItem.goodsReceipt })),
      ...legacy.map((l) => ({ date: l.goodsReceipt.completedAt ?? l.goodsReceipt.createdAt, quantity: l.quantity, unitCost: l.unitCost, receipt: l.goodsReceipt })),
    ]
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .map((r) => ({
        date: r.date,
        receiptId: r.receipt.id,
        receiptNo: r.receipt.receiptNo,
        orderNo: r.receipt.purchaseOrder?.orderNo ?? null,
        supplierName: r.receipt.purchaseOrder?.supplier.name ?? null,
        warehouseName: r.receipt.warehouse.name,
        quantity: r.quantity,
        unitCost: r.unitCost,
      }));
    const totalQty = rows.reduce((a, r) => a + r.quantity, 0);
    const avgCost = totalQty > 0 ? Math.round(rows.reduce((a, r) => a + r.quantity * r.unitCost, 0) / totalQty) : 0;
    return { item, rows, avgCost, minCost: rows.length ? Math.min(...rows.map((r) => r.unitCost)) : 0, maxCost: rows.length ? Math.max(...rows.map((r) => r.unitCost)) : 0 };
  }
}
