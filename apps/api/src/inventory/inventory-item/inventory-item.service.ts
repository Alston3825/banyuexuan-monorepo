import { Injectable } from '@nestjs/common';
import { InventoryItem, WarehousePurpose } from '@prisma/client';
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
    const k = keyword?.trim();
    return this.prisma.inventoryItem.findMany({
      where: {
        tenantId: this.ctx.tenantId,
        status: 'ACTIVE',
        ...(k ? { OR: [{ name: { contains: k } }, { spec: { contains: k } }, { brand: { contains: k } }, { code: { contains: k } }] } : {}),
      },
      select: { id: true, code: true, name: true, spec: true, brand: true, unit: true, referencePrice: true },
      orderBy: [{ name: 'asc' }],
      take: 30,
    });
  }

  create(data: {
    code: string;
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
    return super.create({ ...data, spec: data.spec?.trim() || undefined, brand: data.brand?.trim() || undefined, tenantId: this.ctx.tenantId });
  }

  /** 规格/品牌传空字符串 = 清空（存成 null） */
  update(id: string, data: Record<string, unknown>, expectedVersion: number) {
    const cleaned = { ...data };
    for (const k of ['spec', 'brand', 'category'] as const) {
      if (typeof cleaned[k] === 'string') cleaned[k] = (cleaned[k] as string).trim() || null;
    }
    return super.update(id, cleaned, expectedVersion);
  }
}
