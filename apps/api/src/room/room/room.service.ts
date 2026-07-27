import { BadRequestException, Injectable } from '@nestjs/common';
import { Room } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { BaseScopedCrudService } from '../../common/base/base-scoped-crud.service';
import { QueryRoomDto } from './dto/query-room.dto';
import { QueryRoomBoardDto } from './dto/query-room-board.dto';

export type ComputedRoomStatus = 'MAINTENANCE' | 'OCCUPIED' | 'RESERVED' | 'PENDING_CLEANING' | 'VACANT';

export interface RoomBoardEntry {
  room: Room & { roomType: { id: string; name: string } };
  status: ComputedRoomStatus;
  customerId: string | null;
  customerName: string | null;
  occupancyId: string | null;
}

/**
 * 房间：不存房态枚举，房态在 getBoard() 里按占用记录 + underMaintenance/needsCleaning
 * 两个独立标志实时计算得出（见开发文档"房态以占用记录实时计算，不使用冗余状态字段"）。
 */
@Injectable()
export class RoomService extends BaseScopedCrudService<Room> {
  protected readonly entityType = 'Room';

  constructor(
    private readonly prisma: PrismaService,
    auditLogService: AuditLogService,
    ctx: RequestContextService,
  ) {
    super(auditLogService, ctx);
  }

  protected get delegate() {
    return this.prisma.room;
  }

  findMany(query: QueryRoomDto = {}): Promise<Room[]> {
    return this.prisma.room.findMany({
      where: { tenantId: this.ctx.tenantId, storeId: query.storeId },
      include: { roomType: true },
    });
  }

  create(data: { storeId: string; roomTypeId: string; roomNo: string; floor: string }): Promise<Room> {
    return super.create({ ...data, tenantId: this.ctx.tenantId });
  }

  /** 切换维修标志：独立于占用记录的标志位，前台/店长可随时置位或解除。 */
  async setMaintenance(id: string, underMaintenance: boolean, note: string | undefined, expectedVersion: number): Promise<Room> {
    const before = await this.findOneOrThrow(id);
    if (before.version !== expectedVersion) {
      throw new BadRequestException('数据已被他人修改，请刷新后重试');
    }
    const updated = await this.prisma.room.update({
      where: { id },
      data: { underMaintenance, maintenanceNote: note ?? null, version: { increment: 1 } },
    });
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'Room',
      entityId: id,
      beforeData: before,
      afterData: updated,
      remark: underMaintenance ? '置为维修中' : '解除维修标志',
      ...this.auditCtx(),
    });
    return updated;
  }

  /** 完成清扫：仅当当前处于"待清扫"（needsCleaning=true）时允许。 */
  async markCleaned(id: string, expectedVersion: number): Promise<Room> {
    const before = await this.findOneOrThrow(id);
    if (before.version !== expectedVersion) {
      throw new BadRequestException('数据已被他人修改，请刷新后重试');
    }
    if (!before.needsCleaning) {
      throw new BadRequestException('房间当前不处于待清扫状态');
    }
    const updated = await this.prisma.room.update({
      where: { id },
      data: { needsCleaning: false, version: { increment: 1 } },
    });
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'Room',
      entityId: id,
      beforeData: before,
      afterData: updated,
      remark: '完成清扫',
      ...this.auditCtx(),
    });
    return updated;
  }

  /** 今日房态看板：房态由占用记录 + 独立标志实时计算，不落库任何冗余状态字段。 */
  async getBoard(query: QueryRoomBoardDto): Promise<RoomBoardEntry[]> {
    const date = query.date ? new Date(query.date) : new Date();
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    const rooms = await this.prisma.room.findMany({
      where: { tenantId: this.ctx.tenantId, storeId: query.storeId },
      include: { roomType: true },
      orderBy: [{ floor: 'asc' }, { roomNo: 'asc' }],
    });

    const occupancies = await this.prisma.roomOccupancy.findMany({
      where: {
        tenantId: this.ctx.tenantId,
        storeId: query.storeId,
        status: { in: ['CHECKED_IN', 'RESERVED'] },
        plannedCheckIn: { lt: endOfDay },
        plannedCheckOut: { gt: startOfDay },
      },
      include: { customer: true },
    });

    const occupancyByRoomId = new Map<string, (typeof occupancies)[number]>();
    for (const occ of occupancies) {
      const existing = occupancyByRoomId.get(occ.roomId);
      // 一个房间理论上同时只应有一条有效占用；若冲突，CHECKED_IN 优先于 RESERVED。
      if (!existing || (occ.status === 'CHECKED_IN' && existing.status !== 'CHECKED_IN')) {
        occupancyByRoomId.set(occ.roomId, occ);
      }
    }

    return rooms.map((room) => {
      const occ = occupancyByRoomId.get(room.id);
      let status: ComputedRoomStatus;
      if (room.underMaintenance) status = 'MAINTENANCE';
      else if (occ?.status === 'CHECKED_IN') status = 'OCCUPIED';
      else if (occ?.status === 'RESERVED') status = 'RESERVED';
      else if (room.needsCleaning) status = 'PENDING_CLEANING';
      else status = 'VACANT';

      return {
        room,
        status,
        customerId: occ?.customerId ?? null,
        customerName: occ?.customer.name ?? null,
        occupancyId: occ?.id ?? null,
      };
    });
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
