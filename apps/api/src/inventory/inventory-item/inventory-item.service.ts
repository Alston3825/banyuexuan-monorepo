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

  create(data: {
    code: string;
    name: string;
    unit: string;
    category?: string;
    purpose?: WarehousePurpose;
    safetyStockThreshold?: number;
    shelfLifeDays?: number;
  }) {
    return super.create({ ...data, tenantId: this.ctx.tenantId });
  }
}
