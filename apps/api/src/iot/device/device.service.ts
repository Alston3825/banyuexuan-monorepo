import { Injectable, NotFoundException } from '@nestjs/common';
import { Device } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { BaseScopedCrudService } from '../../common/base/base-scoped-crud.service';

/** 设备台账：门店级物理设备实例，店长可自行管理（同 room.room/warehouse 口径）。 */
@Injectable()
export class DeviceService extends BaseScopedCrudService<Device> {
  protected readonly entityType = 'Device';

  constructor(
    private readonly prisma: PrismaService,
    auditLogService: AuditLogService,
    ctx: RequestContextService,
  ) {
    super(auditLogService, ctx);
  }

  protected get delegate() {
    return this.prisma.device;
  }

  findMany(query: { storeId?: string } = {}): Promise<Device[]> {
    return this.prisma.device.findMany({
      where: { tenantId: this.ctx.tenantId, storeId: query.storeId },
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
