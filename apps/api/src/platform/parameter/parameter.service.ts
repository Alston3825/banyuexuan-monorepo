import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { DataScopeService } from '../../common/scope/data-scope.service';
import { BaseScopedCrudService } from '../../common/base/base-scoped-crud.service';
import { Parameter } from '@prisma/client';

@Injectable()
export class ParameterService extends BaseScopedCrudService<Parameter> {
  protected readonly entityType = 'Parameter';

  constructor(
    private readonly prisma: PrismaService,
    private readonly dataScopeService: DataScopeService,
    auditLogService: AuditLogService,
    ctx: RequestContextService,
  ) {
    super(auditLogService, ctx);
  }

  protected get delegate() {
    return this.prisma.parameter;
  }

  /**
   * MySQL 唯一索引里 NULL 不互斥，(tenantId, storeId=NULL, key) 理论上可重复插入，
   * 因此在应用层先查后插做兜底校验，不完全依赖数据库唯一约束。
   */
  async create(data: {
    key: string;
    value: string;
    valueType?: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'JSON';
    description?: string;
    storeId?: string;
  }): Promise<Parameter> {
    await this.dataScopeService.assertStoreAccessible(this.ctx, data.storeId);
    const existing = await this.prisma.parameter.findFirst({
      where: { tenantId: this.ctx.tenantId, storeId: data.storeId ?? null, key: data.key },
    });
    if (existing) {
      throw new ConflictException(`参数 key="${data.key}" 在该范围内已存在`);
    }
    return super.create({ ...data, tenantId: this.ctx.tenantId });
  }
}
