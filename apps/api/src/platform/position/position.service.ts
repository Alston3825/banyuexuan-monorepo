import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { BaseScopedCrudService } from '../../common/base/base-scoped-crud.service';
import { generateBusinessNo } from '../../common/utils/business-no.util';
import { Position } from '@prisma/client';

@Injectable()
export class PositionService extends BaseScopedCrudService<Position> {
  protected readonly entityType = 'Position';

  constructor(
    private readonly prisma: PrismaService,
    auditLogService: AuditLogService,
    ctx: RequestContextService,
  ) {
    super(auditLogService, ctx);
  }

  protected get delegate() {
    return this.prisma.position;
  }

  create(data: { code?: string; name: string; rank?: number }): Promise<Position> {
    return super.create({ ...data, code: data.code ?? generateBusinessNo('PS'), tenantId: this.ctx.tenantId });
  }
}
