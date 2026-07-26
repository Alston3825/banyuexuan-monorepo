import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { BaseScopedCrudService } from '../../common/base/base-scoped-crud.service';
import { Region } from '@prisma/client';

@Injectable()
export class RegionService extends BaseScopedCrudService<Region> {
  protected readonly entityType = 'Region';

  constructor(
    private readonly prisma: PrismaService,
    auditLogService: AuditLogService,
    ctx: RequestContextService,
  ) {
    super(auditLogService, ctx);
  }

  protected get delegate() {
    return this.prisma.region;
  }

  create(data: { code: string; name: string }): Promise<Region> {
    return super.create({ ...data, tenantId: this.ctx.tenantId });
  }
}
