import { Injectable, NotFoundException } from '@nestjs/common';
import { Device } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { BaseScopedCrudService } from '../../common/base/base-scoped-crud.service';
import { DataScopeService } from '../../common/scope/data-scope.service';

/** 设备台账：门店级物理设备实例，店长可自行管理（同 room.room/warehouse 口径）。 */
@Injectable()
export class DeviceService extends BaseScopedCrudService<Device> {
  protected readonly entityType = 'Device';

  constructor(
    private readonly prisma: PrismaService,
    private readonly dataScopeService: DataScopeService,
    auditLogService: AuditLogService,
    ctx: RequestContextService,
  ) {
    super(auditLogService, ctx);
  }

  protected get delegate() {
    return this.prisma.device;
  }

  /** storeId 若指定必须在调用方门店范围内；未指定则收紧到调用方范围内的全部门店（同 business-report 的 resolveStoreScope 口径）。 */
  async findMany(query: { storeId?: string } = {}): Promise<Device[]> {
    if (query.storeId) {
      await this.dataScopeService.assertStoreAccessible(this.ctx, query.storeId);
      return this.prisma.device.findMany({ where: { tenantId: this.ctx.tenantId, storeId: query.storeId }, orderBy: { createdAt: 'desc' } });
    }
    const allowed = await this.dataScopeService.resolveAllowedStoreIds(this.ctx);
    return this.prisma.device.findMany({
      where: { tenantId: this.ctx.tenantId, storeId: allowed === 'ALL' ? undefined : { in: allowed } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(data: { storeId: string; deviceTypeId: string; code: string; name: string; roomId?: string }): Promise<Device> {
    const deviceType = await this.prisma.deviceType.findUnique({ where: { id: data.deviceTypeId } });
    if (!deviceType) throw new NotFoundException(`DeviceType ${data.deviceTypeId} 不存在`);
    const device = await super.create({ ...data, tenantId: this.ctx.tenantId });
    await this.prisma.deviceShadow.create({ data: { deviceId: device.id } });
    return device;
  }
}
