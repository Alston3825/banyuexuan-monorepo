import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RoomOccupancy } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { generateBusinessNo } from '../../common/utils/business-no.util';
import { runVersionedUpdate } from '../../common/utils/versioned-update.util';
import { CustomerService } from '../../crm/customer/customer.service';
import { CreateRoomOccupancyDto } from './dto/create-room-occupancy.dto';
import { QueryRoomOccupancyDto } from './dto/query-room-occupancy.dto';

/**
 * 占房记录：预订/入住/离店/取消的状态机主体。不接通用审批工作流（已与业务方确认），
 * 前台/店长可直接执行全部状态迁移。合同可选、弱关联（仿照 Contract.opportunityId）。
 * 状态机：RESERVED -(checkIn)-> CHECKED_IN -(checkOut)-> CHECKED_OUT；RESERVED -(cancel)-> CANCELLED。
 * checkOut 会把关联 Room.needsCleaning 置为 true，呼应"离店后进入待清扫"的设计。
 */
@Injectable()
export class RoomOccupancyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customerService: CustomerService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
  ) {}

  async findMany(query: QueryRoomOccupancyDto): Promise<RoomOccupancy[]> {
    const where: Prisma.RoomOccupancyWhereInput = {
      tenantId: this.ctx.tenantId,
      storeId: query.storeId,
      roomId: query.roomId,
      customerId: query.customerId,
      status: query.status,
    };
    return this.prisma.roomOccupancy.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  async findOneOrThrow(id: string): Promise<RoomOccupancy> {
    const occupancy = await this.prisma.roomOccupancy.findUnique({ where: { id } });
    if (!occupancy) throw new NotFoundException(`RoomOccupancy ${id} 不存在`);
    return occupancy;
  }

  /** 预订：创建一条 RESERVED 状态的占用记录。 */
  async create(dto: CreateRoomOccupancyDto): Promise<RoomOccupancy> {
    await this.customerService.findOneOrThrow(dto.customerId);
    const created = await this.prisma.roomOccupancy.create({
      data: {
        roomId: dto.roomId,
        storeId: dto.storeId,
        customerId: dto.customerId,
        contractId: dto.contractId,
        remark: dto.remark,
        plannedCheckIn: new Date(dto.plannedCheckIn),
        plannedCheckOut: new Date(dto.plannedCheckOut),
        occupancyNo: generateBusinessNo('RO'),
        status: 'RESERVED',
        tenantId: this.ctx.tenantId!,
        createdBy: this.ctx.accountId!,
      },
    });
    await this.auditLogService.record({
      action: 'CREATE',
      entityType: 'RoomOccupancy',
      entityId: created.id,
      afterData: created,
      ...this.auditCtx(),
    });
    return created;
  }

  /** 入住：仅允许从 RESERVED 迁移。 */
  async checkIn(id: string, expectedVersion: number): Promise<RoomOccupancy> {
    const before = await this.findOneOrThrow(id);
    this.assertVersion(before, expectedVersion);
    if (before.status !== 'RESERVED') {
      throw new BadRequestException(`占用记录当前状态「${before.status}」不允许入住`);
    }
    const updated = await runVersionedUpdate(() =>
      this.prisma.roomOccupancy.update({
        where: { id, version: expectedVersion },
        data: { status: 'CHECKED_IN', actualCheckInAt: new Date(), version: { increment: 1 } },
      }),
    );
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'RoomOccupancy',
      entityId: id,
      beforeData: before,
      afterData: updated,
      remark: 'RESERVED -> CHECKED_IN',
      ...this.auditCtx(),
    });
    return updated;
  }

  /** 离店：仅允许从 CHECKED_IN 迁移，同时把关联房间标记为待清扫。 */
  async checkOut(id: string, expectedVersion: number): Promise<RoomOccupancy> {
    const before = await this.findOneOrThrow(id);
    this.assertVersion(before, expectedVersion);
    if (before.status !== 'CHECKED_IN') {
      throw new BadRequestException(`占用记录当前状态「${before.status}」不允许离店`);
    }
    const [updated] = await runVersionedUpdate(() =>
      this.prisma.$transaction([
        this.prisma.roomOccupancy.update({
          where: { id, version: expectedVersion },
          data: { status: 'CHECKED_OUT', actualCheckOutAt: new Date(), version: { increment: 1 } },
        }),
        this.prisma.room.update({
          where: { id: before.roomId },
          data: { needsCleaning: true },
        }),
      ]),
    );
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'RoomOccupancy',
      entityId: id,
      beforeData: before,
      afterData: updated,
      remark: 'CHECKED_IN -> CHECKED_OUT（房间已标记待清扫）',
      ...this.auditCtx(),
    });
    return updated;
  }

  /** 取消：仅允许从 RESERVED 迁移，不影响房间清扫标志（从未入住过）。 */
  async cancel(id: string, cancelReason: string, expectedVersion: number): Promise<RoomOccupancy> {
    const before = await this.findOneOrThrow(id);
    this.assertVersion(before, expectedVersion);
    if (before.status !== 'RESERVED') {
      throw new BadRequestException(`占用记录当前状态「${before.status}」不允许取消`);
    }
    const updated = await runVersionedUpdate(() =>
      this.prisma.roomOccupancy.update({
        where: { id, version: expectedVersion },
        data: { status: 'CANCELLED', cancelReason, version: { increment: 1 } },
      }),
    );
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'RoomOccupancy',
      entityId: id,
      beforeData: before,
      afterData: updated,
      remark: `RESERVED -> CANCELLED：${cancelReason}`,
      ...this.auditCtx(),
    });
    return updated;
  }

  private assertVersion(before: RoomOccupancy, expectedVersion: number): void {
    if (before.version !== expectedVersion) {
      throw new ConflictException('数据已被他人修改，请刷新后重试');
    }
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
