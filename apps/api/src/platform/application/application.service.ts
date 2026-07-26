import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { BaseScopedCrudService } from '../../common/base/base-scoped-crud.service';
import { Application } from '@prisma/client';

@Injectable()
export class ApplicationService extends BaseScopedCrudService<Application> {
  protected readonly entityType = 'Application';

  constructor(
    private readonly prisma: PrismaService,
    auditLogService: AuditLogService,
    ctx: RequestContextService,
  ) {
    super(auditLogService, ctx);
  }

  protected get delegate() {
    return this.prisma.application;
  }

  create(data: { code: string; name: string; type: 'WEB' | 'MOBILE' | 'OPENAPI' }): Promise<Application> {
    return super.create(data);
  }
}
