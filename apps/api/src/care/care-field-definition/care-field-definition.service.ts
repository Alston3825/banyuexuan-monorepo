import { Injectable } from '@nestjs/common';
import { CareFieldControlType, CareFieldDefinition, CareTargetType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { BaseScopedCrudService } from '../../common/base/base-scoped-crud.service';
import { QueryCareFieldDefinitionDto } from './dto/query-care-field-definition.dto';

/**
 * 护理字段元数据：四层可配置表单引擎的最底层，租户全局主数据（不做门店范围过滤，
 * 与 ContractTemplate/RoomType 等主数据口径一致）。normalMin/normalMax/normalOptionValues
 * 均为空表示该字段仅作记录、不参与护理异常自动判定。
 */
@Injectable()
export class CareFieldDefinitionService extends BaseScopedCrudService<CareFieldDefinition> {
  protected readonly entityType = 'CareFieldDefinition';

  constructor(
    private readonly prisma: PrismaService,
    auditLogService: AuditLogService,
    ctx: RequestContextService,
  ) {
    super(auditLogService, ctx);
  }

  protected get delegate() {
    return this.prisma.careFieldDefinition;
  }

  findMany(query: QueryCareFieldDefinitionDto = {}): Promise<CareFieldDefinition[]> {
    return this.prisma.careFieldDefinition.findMany({
      where: { tenantId: this.ctx.tenantId, targetType: query.targetType },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(data: {
    code: string;
    name: string;
    targetType: CareTargetType;
    controlType: CareFieldControlType;
    unit?: string;
    options?: unknown;
    normalMin?: number;
    normalMax?: number;
    normalOptionValues?: unknown;
    visibleToClient?: boolean;
  }): Promise<CareFieldDefinition> {
    return super.create({ ...data, tenantId: this.ctx.tenantId });
  }
}
