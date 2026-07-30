import { Injectable } from '@nestjs/common';
import { DeviceType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { BaseScopedCrudService } from '../../common/base/base-scoped-crud.service';

/** 设备类型：协议/品类主数据，总部制定，同 room.type/care.field 口径不开放给 STORE_MANAGER。 */
@Injectable()
export class DeviceTypeService extends BaseScopedCrudService<DeviceType> {
  protected readonly entityType = 'DeviceType';

  constructor(
    private readonly prisma: PrismaService,
    auditLogService: AuditLogService,
    ctx: RequestContextService,
  ) {
    super(auditLogService, ctx);
  }

  protected get delegate() {
    return this.prisma.deviceType;
  }

  findMany(): Promise<DeviceType[]> {
    return this.prisma.deviceType.findMany({ where: { tenantId: this.ctx.tenantId }, orderBy: { createdAt: 'desc' } });
  }

  create(data: { category: DeviceType['category']; name: string; protocol: string; requiresCommandConfirmation?: boolean }) {
    return super.create({ ...data, tenantId: this.ctx.tenantId });
  }
}
