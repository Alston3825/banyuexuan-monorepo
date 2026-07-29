import { Injectable } from '@nestjs/common';
import { Vehicle } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { BaseScopedCrudService } from '../../common/base/base-scoped-crud.service';

/** 车辆：租户全局主数据，不归属单一门店（集团层统一调度池，见业务规则确认记录#15）。 */
@Injectable()
export class VehicleService extends BaseScopedCrudService<Vehicle> {
  protected readonly entityType = 'Vehicle';

  constructor(
    private readonly prisma: PrismaService,
    auditLogService: AuditLogService,
    ctx: RequestContextService,
  ) {
    super(auditLogService, ctx);
  }

  protected get delegate() {
    return this.prisma.vehicle;
  }

  findMany(): Promise<Vehicle[]> {
    return this.prisma.vehicle.findMany({ where: { tenantId: this.ctx.tenantId }, orderBy: { createdAt: 'desc' } });
  }

  create(data: { plateNumber: string; model: string; remark?: string }) {
    return super.create({ ...data, tenantId: this.ctx.tenantId });
  }
}
