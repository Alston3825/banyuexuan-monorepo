import { Injectable } from '@nestjs/common';
import { ContractTemplate } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { BaseScopedCrudService } from '../../common/base/base-scoped-crud.service';

/** 合同模板：法律文本相关主数据，租户全局可见，不做门店范围过滤。 */
@Injectable()
export class ContractTemplateService extends BaseScopedCrudService<ContractTemplate> {
  protected readonly entityType = 'ContractTemplate';

  constructor(
    private readonly prisma: PrismaService,
    auditLogService: AuditLogService,
    ctx: RequestContextService,
  ) {
    super(auditLogService, ctx);
  }

  protected get delegate() {
    return this.prisma.contractTemplate;
  }

  findMany(): Promise<ContractTemplate[]> {
    return this.prisma.contractTemplate.findMany({ where: { tenantId: this.ctx.tenantId } });
  }

  create(data: { code: string; name: string; content: string }): Promise<ContractTemplate> {
    return super.create({ ...data, tenantId: this.ctx.tenantId });
  }
}
