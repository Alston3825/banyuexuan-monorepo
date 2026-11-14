import { Injectable } from '@nestjs/common';
import { Warehouse, WarehousePurpose } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { BaseScopedCrudService } from '../../common/base/base-scoped-crud.service';
import { QueryWarehouseDto } from './dto/query-warehouse.dto';

@Injectable()
export class WarehouseService extends BaseScopedCrudService<Warehouse> {
  protected readonly entityType = 'Warehouse';

  constructor(
    private readonly prisma: PrismaService,
    auditLogService: AuditLogService,
    ctx: RequestContextService,
  ) {
    super(auditLogService, ctx);
  }

  protected get delegate() {
    return this.prisma.warehouse;
  }

  findMany(query: QueryWarehouseDto = {}): Promise<Warehouse[]> {
    return this.prisma.warehouse.findMany({
      where: { tenantId: this.ctx.tenantId, storeId: query.storeId },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(data: { storeId: string; code: string; name: string; purpose?: WarehousePurpose; requiresApproval?: boolean }) {
    return super.create({ ...data, tenantId: this.ctx.tenantId });
  }
}
