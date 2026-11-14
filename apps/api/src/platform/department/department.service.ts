import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { DataScopeService } from '../../common/scope/data-scope.service';
import { BaseScopedCrudService } from '../../common/base/base-scoped-crud.service';
import { generateBusinessNo } from '../../common/utils/business-no.util';
import { Department } from '@prisma/client';

@Injectable()
export class DepartmentService extends BaseScopedCrudService<Department> {
  protected readonly entityType = 'Department';

  constructor(
    private readonly prisma: PrismaService,
    private readonly dataScopeService: DataScopeService,
    auditLogService: AuditLogService,
    ctx: RequestContextService,
  ) {
    super(auditLogService, ctx);
  }

  protected get delegate() {
    return this.prisma.department;
  }

  async create(data: { code?: string; name: string; storeId?: string; parentId?: string }): Promise<Department> {
    await this.dataScopeService.assertStoreAccessible(this.ctx, data.storeId);
    return super.create({ ...data, code: data.code ?? generateBusinessNo('DP'), tenantId: this.ctx.tenantId });
  }
}
