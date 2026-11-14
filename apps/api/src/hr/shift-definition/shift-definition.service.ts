import { Injectable } from '@nestjs/common';
import { ShiftDefinition } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { BaseScopedCrudService } from '../../common/base/base-scoped-crud.service';
import { QueryShiftDefinitionDto } from './dto/query-shift-definition.dto';

/** 班次定义：门店级可配置（不同门店班次时段可能不同），如白班/中班/晚班/夜班/护士早班。 */
@Injectable()
export class ShiftDefinitionService extends BaseScopedCrudService<ShiftDefinition> {
  protected readonly entityType = 'ShiftDefinition';

  constructor(
    private readonly prisma: PrismaService,
    auditLogService: AuditLogService,
    ctx: RequestContextService,
  ) {
    super(auditLogService, ctx);
  }

  protected get delegate() {
    return this.prisma.shiftDefinition;
  }

  findMany(query: QueryShiftDefinitionDto = {}): Promise<ShiftDefinition[]> {
    return this.prisma.shiftDefinition.findMany({
      where: { tenantId: this.ctx.tenantId, storeId: query.storeId },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(data: { storeId: string; code: string; name: string; startTime: string; endTime: string }) {
    return super.create({ ...data, tenantId: this.ctx.tenantId });
  }
}
