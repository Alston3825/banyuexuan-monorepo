import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export interface ConsumedBatch {
  batchId: string;
  quantity: number;
  unitCost: number;
  receivedAt: Date;
  expiresAt: Date | null;
}

/**
 * FEFO（先到期先出）批次消耗：优先消耗有效期最近的批次，无效期批次（不追踪保质期的物品）
 * 按入库时间先进先出兜底消耗，排在有效期批次之后——数据库层面 MySQL 对 NULL 的 ASC 排序会把
 * NULL 排最前，与"不易过期的东西最后再动"的业务直觉相反，所以这里在应用层分两段查询再拼接，
 * 不依赖数据库的 NULL 排序语义。
 *
 * 调用方必须在事务(tx)内使用，且必须保证 WarehouseStock.quantity 与批次总量的一致性——
 * 消耗不足会抛出异常，视为数据不一致（正常情况下不会发生，因为每次增加库存都配套生成批次）。
 */
export async function consumeBatchesFefo(
  tx: Prisma.TransactionClient,
  warehouseId: string,
  itemId: string,
  quantity: number,
): Promise<ConsumedBatch[]> {
  const withExpiry = await tx.stockBatch.findMany({
    where: { warehouseId, itemId, quantity: { gt: 0 }, expiresAt: { not: null } },
    orderBy: { expiresAt: 'asc' },
  });
  const withoutExpiry = await tx.stockBatch.findMany({
    where: { warehouseId, itemId, quantity: { gt: 0 }, expiresAt: null },
    orderBy: { receivedAt: 'asc' },
  });
  const orderedBatches = [...withExpiry, ...withoutExpiry];

  let remaining = quantity;
  const consumed: ConsumedBatch[] = [];
  for (const batch of orderedBatches) {
    if (remaining <= 0) break;
    const take = Math.min(batch.quantity, remaining);
    await tx.stockBatch.update({ where: { id: batch.id }, data: { quantity: batch.quantity - take } });
    consumed.push({ batchId: batch.id, quantity: take, unitCost: batch.unitCost, receivedAt: batch.receivedAt, expiresAt: batch.expiresAt });
    remaining -= take;
  }
  if (remaining > 0) {
    throw new BadRequestException(`批次库存不足，还差 ${remaining} 个单位无法从批次中扣减（请检查库存数据一致性）`);
  }
  return consumed;
}
