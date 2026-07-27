import { Injectable } from '@nestjs/common';
import { RoomType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { BaseScopedCrudService } from '../../common/base/base-scoped-crud.service';

/** 房型：住店运营域的平台级主数据，租户全局可见，不做门店范围过滤。 */
@Injectable()
export class RoomTypeService extends BaseScopedCrudService<RoomType> {
  protected readonly entityType = 'RoomType';

  constructor(
    private readonly prisma: PrismaService,
    auditLogService: AuditLogService,
    ctx: RequestContextService,
  ) {
    super(auditLogService, ctx);
  }

  protected get delegate() {
    return this.prisma.roomType;
  }

  findMany(): Promise<RoomType[]> {
    return this.prisma.roomType.findMany({ where: { tenantId: this.ctx.tenantId } });
  }

  create(data: { code: string; name: string; description?: string; standardPrice?: number }): Promise<RoomType> {
    return super.create({ ...data, tenantId: this.ctx.tenantId });
  }
}
