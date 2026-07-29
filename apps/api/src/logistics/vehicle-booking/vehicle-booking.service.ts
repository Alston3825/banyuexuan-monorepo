import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { VehicleBooking } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { CreateVehicleBookingDto } from './dto/create-vehicle-booking.dto';
import { QueryVehicleBookingDto } from './dto/query-vehicle-booking.dto';

const includeBooking = { vehicle: true, applicant: { select: { id: true, realName: true } } };

/**
 * 车辆使用申请：仅做占用冲突检测（同一车辆的 [startTime, endTime) 不可与其他 BOOKED
 * 记录重叠），不接入通用审批工作流——集团层统一调度池下，冲突检测就是唯一准入门槛。
 */
@Injectable()
export class VehicleBookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
  ) {}

  async findMany(query: QueryVehicleBookingDto = {}): Promise<VehicleBooking[]> {
    return this.prisma.vehicleBooking.findMany({
      where: { tenantId: this.ctx.tenantId, vehicleId: query.vehicleId, storeId: query.storeId, status: query.status },
      include: includeBooking,
      orderBy: { startTime: 'desc' },
    });
  }

  async findOneOrThrow(id: string): Promise<VehicleBooking> {
    const booking = await this.prisma.vehicleBooking.findUnique({ where: { id }, include: includeBooking });
    if (!booking) throw new NotFoundException(`VehicleBooking ${id} 不存在`);
    return booking;
  }

  async create(dto: CreateVehicleBookingDto): Promise<VehicleBooking> {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: dto.vehicleId } });
    if (!vehicle) throw new NotFoundException(`Vehicle ${dto.vehicleId} 不存在`);
    const startTime = new Date(dto.startTime);
    const endTime = new Date(dto.endTime);
    if (endTime <= startTime) throw new BadRequestException('结束时间必须晚于开始时间');

    const conflict = await this.prisma.vehicleBooking.findFirst({
      where: {
        tenantId: this.ctx.tenantId,
        vehicleId: dto.vehicleId,
        status: 'BOOKED',
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
    });
    if (conflict) {
      throw new BadRequestException(`该车辆在此时段已被占用（${conflict.startTime.toLocaleString()} ~ ${conflict.endTime.toLocaleString()}），请选择其他时段或车辆`);
    }

    const created = await this.prisma.vehicleBooking.create({
      data: {
        tenantId: this.ctx.tenantId!,
        vehicleId: dto.vehicleId,
        storeId: dto.storeId,
        applicantId: this.ctx.accountId!,
        purpose: dto.purpose,
        startTime,
        endTime,
        createdBy: this.ctx.accountId!,
      },
      include: includeBooking,
    });
    await this.auditLogService.record({ action: 'CREATE', entityType: 'VehicleBooking', entityId: created.id, afterData: created, ...this.auditCtx(dto.storeId) });
    return created;
  }

  async cancel(id: string, cancelReason: string, expectedVersion: number): Promise<VehicleBooking> {
    const before = await this.findOneOrThrow(id);
    if (before.version !== expectedVersion) throw new ConflictException('数据已被他人修改，请刷新后重试');
    if (before.status !== 'BOOKED') throw new BadRequestException(`使用申请当前状态「${before.status}」不允许取消`);
    const updated = await this.prisma.vehicleBooking.update({
      where: { id },
      data: { status: 'CANCELLED', cancelReason, version: { increment: 1 } },
      include: includeBooking,
    });
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'VehicleBooking',
      entityId: id,
      beforeData: before,
      afterData: updated,
      remark: `BOOKED -> CANCELLED：${cancelReason}`,
      ...this.auditCtx(before.storeId),
    });
    return updated;
  }

  private auditCtx(storeId: string) {
    return {
      tenantId: this.ctx.tenantId,
      storeId,
      accountId: this.ctx.accountId,
      ip: this.ctx.ip,
      userAgent: this.ctx.userAgent,
      requestId: this.ctx.requestId,
    };
  }
}
