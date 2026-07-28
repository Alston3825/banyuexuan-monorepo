import { Injectable } from '@nestjs/common';
import { ServiceProduct } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { BaseScopedCrudService } from '../../common/base/base-scoped-crud.service';

/** 产康项目：租户全局主数据，不做门店范围过滤（与 MealItem 等主数据口径一致）。 */
@Injectable()
export class ServiceProductService extends BaseScopedCrudService<ServiceProduct> {
  protected readonly entityType = 'ServiceProduct';

  constructor(
    private readonly prisma: PrismaService,
    auditLogService: AuditLogService,
    ctx: RequestContextService,
  ) {
    super(auditLogService, ctx);
  }

  protected get delegate() {
    return this.prisma.serviceProduct;
  }

  findMany(): Promise<ServiceProduct[]> {
    return this.prisma.serviceProduct.findMany({ where: { tenantId: this.ctx.tenantId }, orderBy: { createdAt: 'desc' } });
  }

  create(data: { code: string; name: string; durationMinutes?: number; unitPrice?: number }) {
    return super.create({ ...data, tenantId: this.ctx.tenantId });
  }
}
