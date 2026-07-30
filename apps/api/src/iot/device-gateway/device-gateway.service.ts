import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DeviceCategory, DeviceEvent, DeviceShadow } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { RoomCallService } from '../../room/room-call/room-call.service';
import { UtilityExpenseService } from '../../logistics/utility-expense/utility-expense.service';

type DeviceWithType = { id: string; storeId: string; deviceType: { category: DeviceCategory } };

/**
 * 设备网关：本轮用HTTP接口模拟真实MQTT网关的"事件上报"，验证"上报→业务记录自动生成"链路
 * （见业务规则确认记录"P4遗留IoT设备网关框架补齐"）。只把 CALL_SERVICE/UTILITY_METER 两类
 * 事件转换为真实业务记录，其余类别只记录事件、不写业务表。
 */
@Injectable()
export class DeviceGatewayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
    private readonly roomCallService: RoomCallService,
    private readonly utilityExpenseService: UtilityExpenseService,
  ) {}

  async reportEvent(dto: { deviceId: string; eventType: string; payload?: Record<string, unknown> }): Promise<DeviceEvent> {
    const device = await this.prisma.device.findUnique({ where: { id: dto.deviceId }, include: { deviceType: true } });
    if (!device) throw new NotFoundException(`Device ${dto.deviceId} 不存在`);

    const wasOffline = device.status !== 'ONLINE';
    await this.prisma.device.update({ where: { id: device.id }, data: { status: 'ONLINE', lastSeenAt: new Date() } });
    if (wasOffline) {
      await this.prisma.deviceConnectionLog.create({
        data: { tenantId: this.ctx.tenantId!, storeId: device.storeId, deviceId: device.id, logType: 'ONLINE', createdBy: this.ctx.accountId },
      });
    }

    const payload = dto.payload ?? {};
    let businessRefType: string | null = null;
    let businessRefId: string | null = null;
    let processingError: string | null = null;
    try {
      const ref = await this.convertToBusinessRecord(device, payload);
      if (ref) {
        businessRefType = ref.type;
        businessRefId = ref.id;
      }
    } catch (err) {
      processingError = err instanceof Error ? err.message : String(err);
    }

    const event = await this.prisma.deviceEvent.create({
      data: {
        tenantId: this.ctx.tenantId!,
        storeId: device.storeId,
        deviceId: device.id,
        eventType: dto.eventType,
        payload: payload as never,
        processedAt: new Date(),
        businessRefType,
        businessRefId,
        processingError,
        createdBy: this.ctx.accountId!,
      },
    });
    await this.auditLogService.record({
      action: 'CREATE',
      entityType: 'DeviceEvent',
      entityId: event.id,
      afterData: event,
      ...this.auditCtx(),
    });
    return event;
  }

  findEvents(query: { deviceId?: string; storeId?: string } = {}): Promise<DeviceEvent[]> {
    return this.prisma.deviceEvent.findMany({
      where: { tenantId: this.ctx.tenantId, deviceId: query.deviceId, storeId: query.storeId },
      orderBy: { occurredAt: 'desc' },
      take: 100,
    });
  }

  async getShadow(deviceId: string): Promise<DeviceShadow> {
    const shadow = await this.prisma.deviceShadow.findUnique({ where: { deviceId } });
    if (!shadow) throw new NotFoundException(`Device ${deviceId} 的 Shadow 不存在`);
    return shadow;
  }

  async issueCommand(deviceId: string, desiredState: Record<string, unknown>): Promise<DeviceShadow> {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) throw new NotFoundException(`Device ${deviceId} 不存在`);
    const shadow = await this.prisma.deviceShadow.update({
      where: { deviceId },
      data: { desiredState: desiredState as never, desiredVersion: { increment: 1 }, lastCommandAt: new Date() },
    });
    await this.prisma.deviceConnectionLog.create({
      data: {
        tenantId: this.ctx.tenantId!,
        storeId: device.storeId,
        deviceId,
        logType: 'COMMAND_ISSUED',
        detail: desiredState as never,
        createdBy: this.ctx.accountId,
      },
    });
    return shadow;
  }

  async confirmCommand(deviceId: string): Promise<DeviceShadow> {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) throw new NotFoundException(`Device ${deviceId} 不存在`);
    const shadow = await this.prisma.deviceShadow.findUnique({ where: { deviceId } });
    if (!shadow) throw new NotFoundException(`Device ${deviceId} 的 Shadow 不存在`);
    if (shadow.desiredVersion === shadow.reportedVersion) {
      throw new BadRequestException('没有待确认的指令');
    }
    const updated = await this.prisma.deviceShadow.update({
      where: { deviceId },
      data: { reportedState: shadow.desiredState as never, reportedVersion: shadow.desiredVersion, lastReportedAt: new Date() },
    });
    await this.prisma.deviceConnectionLog.create({
      data: {
        tenantId: this.ctx.tenantId!,
        storeId: device.storeId,
        deviceId,
        logType: 'COMMAND_CONFIRMED',
        detail: shadow.desiredState as never,
        createdBy: this.ctx.accountId,
      },
    });
    return updated;
  }

  private async convertToBusinessRecord(device: DeviceWithType, payload: Record<string, unknown>): Promise<{ type: string; id: string } | null> {
    switch (device.deviceType.category) {
      case 'CALL_SERVICE':
        return this.convertCallEvent(device, payload);
      case 'UTILITY_METER':
        return this.convertUtilityMeterEvent(device, payload);
      default:
        return null; // 其余类别本轮只留痕，不做业务转换（见业务规则确认记录）
    }
  }

  private async convertCallEvent(device: DeviceWithType, payload: Record<string, unknown>) {
    const roomId = payload.roomId as string | undefined;
    if (!roomId) throw new BadRequestException('呼叫事件缺少 roomId');
    const occupancy = await this.prisma.roomOccupancy.findFirst({
      where: { tenantId: this.ctx.tenantId, roomId, status: 'CHECKED_IN' },
    });
    if (!occupancy) throw new BadRequestException(`房间 ${roomId} 当前没有在住占用记录，无法生成呼叫记录`);
    const reason = (payload.reason as string) || `设备呼叫（设备编号：${device.id}）`;
    const call = await this.roomCallService.create({ occupancyId: occupancy.id, reason });
    return { type: 'RoomCall', id: call.id };
  }

  private async convertUtilityMeterEvent(device: DeviceWithType, payload: Record<string, unknown>) {
    const period = (payload.period as string) || new Date().toISOString().slice(0, 7);
    const expenseType = payload.expenseType as string | undefined;
    const amount = payload.amount as number | undefined;
    if (!expenseType || typeof amount !== 'number') {
      throw new BadRequestException('能耗计量事件缺少 expenseType 或 amount');
    }
    const existing = await this.prisma.utilityExpense.findFirst({
      where: { tenantId: this.ctx.tenantId, storeId: device.storeId, period, expenseType: expenseType as never },
    });
    if (existing) {
      const updated = await this.utilityExpenseService.update(existing.id, { amount }, existing.version);
      return { type: 'UtilityExpense', id: updated.id };
    }
    const created = await this.utilityExpenseService.create({ storeId: device.storeId, period, expenseType: expenseType as never, amount });
    return { type: 'UtilityExpense', id: created.id };
  }

  private auditCtx() {
    return {
      tenantId: this.ctx.tenantId,
      storeId: this.ctx.homeStoreId,
      accountId: this.ctx.accountId,
      ip: this.ctx.ip,
      userAgent: this.ctx.userAgent,
      requestId: this.ctx.requestId,
    };
  }
}
