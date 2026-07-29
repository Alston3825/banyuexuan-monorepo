import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { QueryStockBatchDto } from './dto/query-stock-batch.dto';

const includeBatch = { warehouse: true, item: true };

/** 批次只读查询：数量与效期由入库/出库/调拨/盘点单的 execute() 维护，不提供写操作。 */
@Injectable()
export class StockBatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContextService,
  ) {}

  findMany(query: QueryStockBatchDto = {}) {
    return this.prisma.stockBatch.findMany({
      where: { tenantId: this.ctx.tenantId, warehouseId: query.warehouseId, itemId: query.itemId, quantity: { gt: 0 } },
      include: includeBatch,
      orderBy: { expiresAt: 'asc' },
    });
  }

  /** 过期预警：已过期 + 临期（withinDays 天内到期），quantity=0 的批次（已耗尽）不参与预警。 */
  async expiryAlerts(query: { warehouseId?: string; withinDays?: number } = {}) {
    const withinDays = query.withinDays ?? 7;
    const threshold = new Date();
    threshold.setDate(threshold.getDate() + withinDays);

    const batches = await this.prisma.stockBatch.findMany({
      where: {
        tenantId: this.ctx.tenantId,
        warehouseId: query.warehouseId,
        quantity: { gt: 0 },
        expiresAt: { not: null, lte: threshold },
      },
      include: includeBatch,
      orderBy: { expiresAt: 'asc' },
    });
    const now = new Date();
    return batches.map((b) => ({ ...b, isExpired: b.expiresAt !== null && b.expiresAt < now }));
  }
}
