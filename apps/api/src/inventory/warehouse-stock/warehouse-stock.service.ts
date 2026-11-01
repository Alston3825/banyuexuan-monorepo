import { Injectable } from '@nestjs/common';
import { itemMatchesKeyword } from '../common/item-match';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { QueryWarehouseStockDto } from './dto/query-warehouse-stock.dto';

const includeStock = { warehouse: true, item: true };

/**
 * 库存汇总只读查询：数量与移动加权平均成本由各单据的 execute() 维护，
 * 本服务不提供任何写操作（见 GoodsReceiptService/StockIssueService 等）。
 */
@Injectable()
export class WarehouseStockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContextService,
  ) {}

  findMany(query: QueryWarehouseStockDto = {}) {
    return this.prisma.warehouseStock.findMany({
      where: {
        warehouseId: query.warehouseId,
        itemId: query.itemId,
        warehouse: { tenantId: this.ctx.tenantId },
      },
      include: includeStock,
      orderBy: { updatedAt: 'desc' },
    });
  }

  /** 低库存预警：quantity < item.safetyStockThreshold（未配置阈值的物品不参与预警）。 */
  async lowStockAlerts(query: { warehouseId?: string } = {}) {
    const stocks = await this.prisma.warehouseStock.findMany({
      where: { warehouseId: query.warehouseId, warehouse: { tenantId: this.ctx.tenantId }, item: { safetyStockThreshold: { not: null } } },
      include: includeStock,
    });
    return stocks.filter((s) => s.quantity < s.item.safetyStockThreshold!);
  }

  /**
   * 库存总览（库存查询页默认看这个）：物品库里每一种在用物品一行，带当前库存数量（没有入过库的算 0）、
   * 安全库存阈值、状态（缺货 / 低库存 / 正常 / 未设阈值），以及分仓库存。
   * 低库存 = 设了安全库存阈值且数量 < 阈值；缺货 = 设了阈值且数量为 0。选了仓库就只算这个仓库，没选就是所有仓库合计。
   * 预警的排在最前面。keyword 按名称/规格/品牌/编码搜。
   */
  async overview(query: { warehouseId?: string; keyword?: string; status?: 'ALL' | 'ALERT' | 'LOW' | 'OUT' | 'IN_STOCK' } = {}) {
    const k = query.keyword?.trim();
    const allItems = await this.prisma.inventoryItem.findMany({
      where: { tenantId: this.ctx.tenantId, status: 'ACTIVE' },
      orderBy: { name: 'asc' },
      take: 5000,
    });
    // 名称/规格/品牌/编码 + 拼音（全拼/首字母）
    const items = k ? allItems.filter((i) => itemMatchesKeyword(i, k)) : allItems;
    const stocks = await this.prisma.warehouseStock.findMany({
      where: { warehouseId: query.warehouseId, warehouse: { tenantId: this.ctx.tenantId }, itemId: { in: items.map((i) => i.id) } },
      include: { warehouse: { select: { id: true, name: true } } },
    });
    // 最近一次入库的实际单价（分）
    const recent = await this.prisma.stockBatch.findMany({
      where: { tenantId: this.ctx.tenantId, sourceType: 'GOODS_RECEIPT', itemId: { in: items.map((i) => i.id) } },
      select: { itemId: true, unitCost: true },
      orderBy: { receivedAt: 'desc' },
    });
    const lastCostByItem = new Map<string, number>();
    for (const b of recent) if (!lastCostByItem.has(b.itemId)) lastCostByItem.set(b.itemId, b.unitCost);
    const byItem = new Map<string, typeof stocks>();
    for (const st of stocks) byItem.set(st.itemId, [...(byItem.get(st.itemId) ?? []), st]);

    type Status = 'OUT' | 'LOW' | 'OK' | 'NO_THRESHOLD';
    const rows = items.map((it) => {
      const list = byItem.get(it.id) ?? [];
      const quantity = list.reduce((sum, st) => sum + st.quantity, 0);
      const totalCost = list.reduce((sum, st) => sum + st.quantity * st.avgCost, 0);
      const threshold = it.safetyStockThreshold;
      let status: Status = 'NO_THRESHOLD';
      if (threshold !== null) status = quantity <= 0 ? 'OUT' : quantity < threshold ? 'LOW' : 'OK';
      return {
        itemId: it.id,
        code: it.code,
        name: it.name,
        spec: it.spec,
        brand: it.brand,
        unit: it.unit,
        category: it.category,
        safetyStockThreshold: threshold,
        quantity,
        lastCost: lastCostByItem.get(it.id) ?? null,
        avgCost: quantity > 0 ? Math.round(totalCost / quantity) : 0, // 分，按各仓库存加权
        status,
        warehouses: list.filter((st) => st.quantity !== 0).map((st) => ({ warehouseId: st.warehouseId, warehouseName: st.warehouse.name, quantity: st.quantity })),
        updatedAt: list.reduce<Date | null>((m, st) => (!m || st.updatedAt > m ? st.updatedAt : m), null),
      };
    });

    const summary = {
      itemCount: rows.length,
      alertCount: rows.filter((r) => r.status === 'LOW' || r.status === 'OUT').length,
      outCount: rows.filter((r) => r.status === 'OUT').length,
      lowCount: rows.filter((r) => r.status === 'LOW').length,
      inStockCount: rows.filter((r) => r.quantity > 0).length,
      totalValue: rows.reduce((sum, r) => sum + r.quantity * r.avgCost, 0), // 分
    };
    const rank: Record<Status, number> = { OUT: 0, LOW: 1, OK: 2, NO_THRESHOLD: 3 };
    const status = query.status ?? 'ALL';
    const filtered = rows
      .filter((r) => (status === 'ALERT' ? r.status === 'LOW' || r.status === 'OUT' : status === 'LOW' ? r.status === 'LOW' : status === 'OUT' ? r.status === 'OUT' : status === 'IN_STOCK' ? r.quantity > 0 : true))
      .sort((a, b) => rank[a.status] - rank[b.status] || a.name.localeCompare(b.name, 'zh'));
    return { summary, rows: filtered };
  }
}
