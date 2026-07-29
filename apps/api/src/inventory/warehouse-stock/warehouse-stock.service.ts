import { Injectable } from '@nestjs/common';
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
}
