import { Injectable } from '@nestjs/common';
import { Supplier } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { BaseScopedCrudService } from '../../common/base/base-scoped-crud.service';

/** 供应商：租户全局主数据，不做门店范围过滤（与其余主数据口径一致）。 */
@Injectable()
export class SupplierService extends BaseScopedCrudService<Supplier> {
  protected readonly entityType = 'Supplier';

  constructor(
    private readonly prisma: PrismaService,
    auditLogService: AuditLogService,
    ctx: RequestContextService,
  ) {
    super(auditLogService, ctx);
  }

  protected get delegate() {
    return this.prisma.supplier;
  }

  findMany(): Promise<Supplier[]> {
    return this.prisma.supplier.findMany({ where: { tenantId: this.ctx.tenantId }, orderBy: { createdAt: 'desc' } });
  }

  create(data: { code: string; name: string; contactName?: string; phone?: string; remark?: string }) {
    return super.create({ ...data, tenantId: this.ctx.tenantId });
  }
}
