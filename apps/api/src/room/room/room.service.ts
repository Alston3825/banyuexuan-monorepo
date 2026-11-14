import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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
  /** 当前占用记录的计划入住/离店日期（无占用时为 null），供看板卡片直接展示 */
  plannedCheckIn: Date | null;
  plannedCheckOut: Date | null;
  /** 客户预产期（仅日期），看板卡片展示并做"不足7天"红色提醒 */
  expectedDueDate: Date | null;
  /** 签单人：优先取关联合同上的签单人，没有合同时退回客户的归属销售，都没有为 null */
  signerName: string | null;
  /** 实际入住时间（办理入住后才有）；预订中的日期都是预估，客户实际入住当天才确定 */
  actualCheckInAt: Date | null;
  /** 关联的合同（房态排房时带上）：套餐朝向/入住天数/护理模式来自合同 */
  contract: {
    id: string;
    paperNo: string | null;
    orientation: 'SOUTH' | 'NORTH' | 'BOTH' | null;
    careMode: 'ONE_TO_ONE' | 'ONE_TO_TWO' | null;
    inHouseDays: number | null;
    homeServiceDays: number;
  } | null;
  /** 这次入住对应的母婴档案里的护理信息（房态看板展示）：当前生效的护理等级、主责护理师；没建档为 null */
  careBrief: { level: string | null; nurseName: string | null } | null;
}

export interface RoomDeleteCheck {
  roomId: string;
  roomNo: string;
  /** 该房间名下全部预订/入住记录数（含已离店、已取消的历史记录） */
  occupancyTotal: number;
  /** 其中仍在进行的（预订中/已入住），存在时任何人都不能删 */
  activeOccupancyCount: number;
  /** 绑定在该房间上的设备台账数（删除时自动解绑，不删设备） */
  deviceCount: number;
  /** 挂在历史占用记录下的业务数据（母婴档案/呼叫/外出/领用/用膳档案），存在时任何人都不能删 */
  blockers: string[];
  /** 是否属于"已有正式数据"的房间：有占用记录或绑定设备 */
  hasData: boolean;
  /** 当前账号是否拥有"强制删除有数据房间"的管理员权限 */
  canForceDelete: boolean;
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

  /**
   * 删除前的影响预检：前端据此决定弹哪种确认框。同一份检查在 remove() 里会再做一遍，
   * 不信任前端传来的任何"我已经检查过"，权限和依赖一律以后端为准。
   */
  async getDeleteCheck(id: string): Promise<RoomDeleteCheck> {
    const room = await this.findOneOrThrow(id);
    if (room.tenantId !== this.ctx.tenantId) throw new NotFoundException(`Room ${id} 不存在`);

    const occupancyIds = (
      await this.prisma.roomOccupancy.findMany({ where: { roomId: id }, select: { id: true, status: true } })
    );
    const ids = occupancyIds.map((o) => o.id);
    const activeOccupancyCount = occupancyIds.filter((o) => o.status === 'RESERVED' || o.status === 'CHECKED_IN').length;

    const inOccupancy = { occupancyId: { in: ids } };
    const [motherProfiles, dinerProfiles, calls, outings, requisitions, deviceCount, canForceDelete] = await Promise.all([
      ids.length ? this.prisma.motherProfile.count({ where: inOccupancy }) : 0,
      ids.length ? this.prisma.dinerProfile.count({ where: inOccupancy }) : 0,
      ids.length ? this.prisma.roomCall.count({ where: inOccupancy }) : 0,
      ids.length ? this.prisma.roomOuting.count({ where: inOccupancy }) : 0,
      ids.length ? this.prisma.roomServiceRequisition.count({ where: inOccupancy }) : 0,
      this.prisma.device.count({ where: { roomId: id } }),
      this.ctx.hasPermission('room.room.force-delete'),
    ]);
    const blockers: string[] = [];
    if (motherProfiles) blockers.push(`${motherProfiles} 份母婴档案`);
    if (dinerProfiles) blockers.push(`${dinerProfiles} 份用膳档案`);
    if (calls) blockers.push(`${calls} 条呼叫记录`);
    if (outings) blockers.push(`${outings} 条外出记录`);
    if (requisitions) blockers.push(`${requisitions} 条客房服务领用记录`);

    return {
      roomId: id,
      roomNo: room.roomNo,
      occupancyTotal: ids.length,
      activeOccupancyCount,
      deviceCount,
      blockers,
      hasData: ids.length > 0 || deviceCount > 0,
      canForceDelete,
    };
  }

  /**
   * 删除房间。三道防线：
   * 1. 有仍在进行的预订/入住，或历史记录下挂着母婴/用膳/呼叫/外出/领用等业务数据 → 任何人都不能删
   *    （这类数据不能因为删房间而丢，只能改用"标记维修"停用）；
   * 2. 只要房间有预订/入住记录或绑定设备（"正式数据"），必须拥有 room.room.force-delete（管理员权限）；
   * 3. 有正式数据的房间还要求请求里带上正确的房间号（前端让用户手输），防止误点/误调。
   * 空房间（从没用过）用 room.room.delete 即可直接删。
   */
  async remove(id: string, confirmRoomNo?: string): Promise<void> {
    const check = await this.getDeleteCheck(id);
    const room = await this.findOneOrThrow(id);

    if (check.activeOccupancyCount > 0) {
      throw new ConflictException(
        `房间「${room.roomNo}」还有 ${check.activeOccupancyCount} 条未结束的预订/入住记录，请先办理离店或取消预订后再删除`,
      );
    }
    if (check.blockers.length > 0) {
      throw new ConflictException(
        `房间「${room.roomNo}」的历史记录下关联了${check.blockers.join('、')}，删除会造成这些数据丢失，无法删除；如不再使用，请改用"标记维修"停用该房间`,
      );
    }
    if (check.hasData) {
      if (!check.canForceDelete) {
        throw new ForbiddenException(
          `房间「${room.roomNo}」已有 ${check.occupancyTotal} 条预订/入住记录${check.deviceCount ? `、${check.deviceCount} 台绑定设备` : ''}，属于正式数据，删除需要管理员权限，请联系管理员`,
        );
      }
      if (confirmRoomNo !== room.roomNo) {
        throw new BadRequestException(`该房间已有正式数据，删除前请输入房间号「${room.roomNo}」确认`);
      }
    }

    const occupancies = await this.prisma.roomOccupancy.findMany({
      where: { roomId: id },
      select: { id: true, customerId: true, status: true, plannedCheckIn: true, plannedCheckOut: true },
    });
    await this.prisma.$transaction([
      this.prisma.device.updateMany({ where: { roomId: id }, data: { roomId: null } }),
      this.prisma.roomOccupancy.deleteMany({ where: { roomId: id } }),
      this.prisma.room.delete({ where: { id } }),
    ]);
    await this.auditLogService.record({
      action: 'DELETE',
      entityType: 'Room',
      entityId: id,
      beforeData: { room, occupancies },
      remark: check.hasData
        ? `管理员删除有数据的房间：连带删除 ${occupancies.length} 条历史占用记录，解绑 ${check.deviceCount} 台设备`
        : '删除空房间',
      ...this.auditCtx(),
    });
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
      include: {
        customer: { include: { assignedTo: { select: { realName: true } } } },
        contract: {
          select: {
            id: true,
            paperNo: true,
            orientation: true,
            careMode: true,
            inHouseDays: true,
            homeServiceDays: true,
            signer: { select: { realName: true } },
          },
        },
      },
    });

    // 护理信息：按入住记录找母婴档案 → 主责护理师 + 妈妈当前生效的护理计划等级
    const occIds = occupancies.map((o) => o.id);
    const profiles = occIds.length
      ? await this.prisma.motherProfile.findMany({
          where: { tenantId: this.ctx.tenantId, occupancyId: { in: occIds } },
          select: { id: true, occupancyId: true, primaryNurse: { select: { realName: true } } },
        })
      : [];
    const plans = profiles.length
      ? await this.prisma.carePlanVersion.findMany({
          where: { tenantId: this.ctx.tenantId, motherProfileId: { in: profiles.map((p) => p.id) }, babyProfileId: null, status: 'ACTIVE' },
          select: { motherProfileId: true, level: true },
        })
      : [];
    const levelByProfile = new Map(plans.map((p) => [p.motherProfileId, p.level as string]));
    const careByOccupancy = new Map(profiles.map((p) => [p.occupancyId as string, { level: levelByProfile.get(p.id) ?? null, nurseName: p.primaryNurse?.realName ?? null }]));

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
        plannedCheckIn: occ?.plannedCheckIn ?? null,
        plannedCheckOut: occ?.plannedCheckOut ?? null,
        expectedDueDate: occ?.customer.expectedDueDate ?? null,
        signerName: occ?.contract?.signer?.realName ?? occ?.customer.assignedTo?.realName ?? null,
        actualCheckInAt: occ?.actualCheckInAt ?? null,
        careBrief: occ ? (careByOccupancy.get(occ.id) ?? null) : null,
        contract: occ?.contract
          ? {
              id: occ.contract.id,
              paperNo: occ.contract.paperNo,
              orientation: occ.contract.orientation,
              careMode: occ.contract.careMode,
              inHouseDays: occ.contract.inHouseDays,
              homeServiceDays: occ.contract.homeServiceDays,
            }
          : null,
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
