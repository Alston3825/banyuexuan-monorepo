import { Injectable } from '@nestjs/common';
import { ServicePackage } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { BaseScopedCrudService } from '../../common/base/base-scoped-crud.service';

/**
 * 服务包：租户全局主数据。购买时不预先绑定具体项目——执行(ServiceAppointment)时才临时
 * 消耗额度，见竞品分析3.4"按需项目机制"，因此这里不维护 applicableProductIds 之类的绑定。
 */
@Injectable()
export class ServicePackageService extends BaseScopedCrudService<ServicePackage> {
  protected readonly entityType = 'ServicePackage';

  constructor(
    private readonly prisma: PrismaService,
    auditLogService: AuditLogService,
    ctx: RequestContextService,
  ) {
    super(auditLogService, ctx);
  }

  protected get delegate() {
    return this.prisma.servicePackage;
  }

  findMany(): Promise<ServicePackage[]> {
    return this.prisma.servicePackage.findMany({ where: { tenantId: this.ctx.tenantId }, orderBy: { createdAt: 'desc' } });
  }

  create(data: { code: string; name: string; totalSessions: number; price: number }) {
    return super.create({ ...data, tenantId: this.ctx.tenantId });
  }
}
