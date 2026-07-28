import { Injectable } from '@nestjs/common';
import { MealItem, MealSlot } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { BaseScopedCrudService } from '../../common/base/base-scoped-crud.service';

/** 菜品：租户全局主数据，不做门店范围过滤（与 CareFieldDefinition 等主数据口径一致）。 */
@Injectable()
export class MealItemService extends BaseScopedCrudService<MealItem> {
  protected readonly entityType = 'MealItem';

  constructor(
    private readonly prisma: PrismaService,
    auditLogService: AuditLogService,
    ctx: RequestContextService,
  ) {
    super(auditLogService, ctx);
  }

  protected get delegate() {
    return this.prisma.mealItem;
  }

  findMany(): Promise<MealItem[]> {
    return this.prisma.mealItem.findMany({ where: { tenantId: this.ctx.tenantId }, orderBy: { createdAt: 'desc' } });
  }

  create(data: { code: string; name: string; defaultSlot: MealSlot; ingredientTags?: unknown }) {
    return super.create({ ...data, tenantId: this.ctx.tenantId });
  }
}
