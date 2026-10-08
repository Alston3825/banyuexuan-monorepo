import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RoomOccupancy } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { generateBusinessNo } from '../../common/utils/business-no.util';
import { runVersionedUpdate } from '../../common/utils/versioned-update.util';
import { CustomerService } from '../../crm/customer/customer.service';
import { CreateRoomOccupancyDto } from './dto/create-room-occupancy.dto';
import { brief, computeConflicts, ConflictBrief, ConflictOccupancy, overlapsWithBuffer, RoomConflict } from './room-conflicts.util';
import { QueryRoomOccupancyDto } from './dto/query-room-occupancy.dto';
import { RescheduleRoomOccupancyDto } from './dto/reschedule-room-occupancy.dto';

/**
 * 占房记录：预订/入住/离店/取消的状态机主体。不接通用审批工作流（已与业务方确认），
 * 前台/店长可直接执行全部状态迁移。合同可选、弱关联（仿照 Contract.opportunityId）。
 * 状态机：RESERVED -(checkIn)-> CHECKED_IN -(checkOut)-> CHECKED_OUT；RESERVED -(cancel)-> CANCELLED。
 * checkOut 会把关联 Room.needsCleaning 置为 true，呼应"离店后进入待清扫"的设计。
 *
 * 预订日期本来就是预估的（销售按预产期估，真正入住当天才定），所以【预订阶段允许同一间房日期重叠】：
 * 不再拒绝，而是保存后返回 conflicts 提示，并进入“预订冲突”待协调清单（换房/改日期解决）。
 * 真正的硬拦只在【办理入住】：房间里现在还住着别人时不能办入住。房间之间默认留 1 天整理时间（参数 room.turnover_buffer_days）。
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
      // 房态横排时间轴用：区间重叠判断（不是 createdAt 落在窗口内）——
      // [checkIn, checkOut) 跟 [from, to] 有交集的写法：checkIn <= to 且 checkOut >= from。
      ...(query.from && query.to
        ? { plannedCheckIn: { lte: new Date(query.to) }, plannedCheckOut: { gte: new Date(query.from) } }
        : {}),
    };
    return this.prisma.roomOccupancy.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  async findOneOrThrow(id: string): Promise<RoomOccupancy> {
    const occupancy = await this.prisma.roomOccupancy.findUnique({ where: { id } });
    if (!occupancy) throw new NotFoundException(`RoomOccupancy ${id} 不存在`);
    return occupancy;
  }

  /**
   * 同一间房、状态还生效（RESERVED/CHECKED_IN）的占用记录里，有没有跟 [checkIn, checkOut) 重叠的——
   * 房态横排时间轴允许直接点空格子建预订/拖改日期，必须在这里兜底校验，不能只靠前端不点重叠格子，
   * 否则并发或前端疏漏时会出现同一间房两条重叠预订，这是新增时间轴视图前 create() 本身没做的漏洞，
   * 顺带一起补上（reschedule 复用同一个校验）。
   */
  /** 房间整理间隔（天）：上一位离店后至少隔这么多天，下一位才能入住。默认 1，可在参数配置里改。 */
  private async bufferDays(): Promise<number> {
    const p = await this.prisma.parameter.findFirst({ where: { tenantId: this.ctx.tenantId, storeId: null, key: 'room.turnover_buffer_days' } });
    const n = p ? Number(p.value) : 1;
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 1;
  }

  /** 和 [checkIn, checkOut) 冲突的其他生效占用（只提示，不拦截）。 */
  private async softConflicts(roomId: string, checkIn: Date, checkOut: Date, excludeId?: string): Promise<ConflictBrief[]> {
    const buf = await this.bufferDays();
    const rows = await this.prisma.roomOccupancy.findMany({
      where: { roomId, status: { in: ['RESERVED', 'CHECKED_IN'] }, id: excludeId ? { not: excludeId } : undefined },
      include: { customer: { select: { name: true } }, contract: { select: { status: true } } },
    });
    return rows
      .filter((r) => overlapsWithBuffer(checkIn, checkOut, r.plannedCheckIn, r.plannedCheckOut, buf))
      .map((r) =>
        brief({
          id: r.id,
          roomId: r.roomId,
          occupancyNo: r.occupancyNo,
          status: r.status as 'RESERVED' | 'CHECKED_IN',
          plannedCheckIn: r.plannedCheckIn,
          plannedCheckOut: r.plannedCheckOut,
          createdAt: r.createdAt,
          contractId: r.contractId,
          contractStatus: r.contract?.status ?? null,
          customerName: r.customer.name,
          roomNo: '',
        }),
      );
  }

  /** 门店里所有互相冲突的预订（同一间房日期重叠，或间隔不足整理时间），按冲突开始的先后排序。 */
  async findConflicts(storeId?: string): Promise<RoomConflict[]> {
    const rows = await this.prisma.roomOccupancy.findMany({
      where: {
        tenantId: this.ctx.tenantId,
        storeId,
        status: { in: ['RESERVED', 'CHECKED_IN'] },
        plannedCheckOut: { gte: new Date(Date.now() - 3 * 86400_000) },
      },
      include: { customer: { select: { name: true } }, room: { select: { roomNo: true } }, contract: { select: { status: true } } },
    });
    const list: ConflictOccupancy[] = rows.map((r) => ({
      id: r.id,
      roomId: r.roomId,
      occupancyNo: r.occupancyNo,
      status: r.status as 'RESERVED' | 'CHECKED_IN',
      plannedCheckIn: r.plannedCheckIn,
      plannedCheckOut: r.plannedCheckOut,
      createdAt: r.createdAt,
      contractId: r.contractId,
      contractStatus: r.contract?.status ?? null,
      customerName: r.customer.name,
      roomNo: r.room.roomNo,
    }));
    return computeConflicts(list, await this.bufferDays());
  }

  /** 这条预订可以换到的空房：同门店、没有维修、这段时间（含整理间隔）没人占；同房型的排前面。 */
  async freeRooms(id: string) {
    const occ = await this.findOneOrThrow(id);
    const buf = await this.bufferDays();
    const [rooms, active, current] = await Promise.all([
      this.prisma.room.findMany({ where: { tenantId: this.ctx.tenantId, storeId: occ.storeId, underMaintenance: false, id: { not: occ.roomId } }, include: { roomType: { select: { id: true, name: true } } }, orderBy: { roomNo: 'asc' } }),
      this.prisma.roomOccupancy.findMany({ where: { tenantId: this.ctx.tenantId, storeId: occ.storeId, status: { in: ['RESERVED', 'CHECKED_IN'] }, id: { not: id } } }),
      this.prisma.room.findUniqueOrThrow({ where: { id: occ.roomId }, select: { roomTypeId: true } }),
    ]);
    const busy = new Set(active.filter((a) => overlapsWithBuffer(occ.plannedCheckIn, occ.plannedCheckOut, a.plannedCheckIn, a.plannedCheckOut, buf)).map((a) => a.roomId));
    return rooms
      .filter((r) => !busy.has(r.id))
      .map((r) => ({ id: r.id, roomNo: r.roomNo, floor: r.floor, roomTypeName: r.roomType.name, sameType: r.roomTypeId === current.roomTypeId }))
      .sort((x, y) => Number(y.sameType) - Number(x.sameType));
  }

  /** 换房：只允许还没入住的预订，目标房间这段时间必须是空的。 */
  async changeRoom(id: string, roomId: string, expectedVersion: number): Promise<RoomOccupancy> {
    const before = await this.findOneOrThrow(id);
    this.assertVersion(before, expectedVersion);
    if (before.status !== 'RESERVED') throw new BadRequestException('已入住的客户不能直接换房，请先办理离店后重新排房');
    if (roomId === before.roomId) throw new BadRequestException('已经是这间房了');
    const free = await this.freeRooms(id);
    if (!free.some((r) => r.id === roomId)) throw new ConflictException('目标房间在这段时间已有其他预订、正在维修，或不属于本门店，请换一间');
    const updated = await runVersionedUpdate(() => this.prisma.roomOccupancy.update({ where: { id, version: expectedVersion }, data: { roomId, version: { increment: 1 } } }));
    await this.auditLogService.record({
      action: 'UPDATE',
      entityType: 'RoomOccupancy',
      entityId: id,
      beforeData: before,
      afterData: updated,
      changedFields: ['roomId'],
      remark: `换房：${before.roomId} -> ${roomId}`,
      ...this.auditCtx(),
    });
    return updated;
  }

  /**
   * 把这位客户还没关联入住的母婴档案（或原来关联的入住已取消的）自动关联到这条入住记录——
   * 母婴档案列表的"房号"、护理看板的房间卡片、日常护理记录的入住天数都靠这个关联。
   * 取客户最近建的那一份档案（再次入住的妈妈会有多份档案，老档案不动）。
   */
  private async linkMotherProfile(occ: { id: string; customerId: string }): Promise<void> {
    const profile = await this.prisma.motherProfile.findFirst({
      where: { tenantId: this.ctx.tenantId, customerId: occ.customerId, OR: [{ occupancyId: null }, { occupancy: { status: 'CANCELLED' } }] },
      orderBy: { createdAt: 'desc' },
    });
    if (!profile) return;
    await this.prisma.motherProfile.update({ where: { id: profile.id }, data: { occupancyId: occ.id, version: { increment: 1 } } });
    await this.auditLogService.record({
      action: 'UPDATE',
      entityType: 'MotherProfile',
      entityId: profile.id,
      remark: `自动关联入住记录 ${occ.id}`,
      ...this.auditCtx(),
    });
  }

  /** 预订：创建一条 RESERVED 状态的占用记录。 */
  async create(dto: CreateRoomOccupancyDto): Promise<RoomOccupancy & { conflicts: ConflictBrief[] }> {
    await this.customerService.findOneOrThrow(dto.customerId);
    if (new Date(dto.plannedCheckOut) <= new Date(dto.plannedCheckIn)) throw new BadRequestException('计划离店日期必须晚于计划入住日期');
    const conflicts = await this.softConflicts(dto.roomId, new Date(dto.plannedCheckIn), new Date(dto.plannedCheckOut));
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
    await this.linkMotherProfile(created);
    return { ...created, conflicts };
  }

  /** 入住：仅允许从 RESERVED 迁移。 */
  async checkIn(id: string, expectedVersion: number): Promise<RoomOccupancy> {
    const before = await this.findOneOrThrow(id);
    this.assertVersion(before, expectedVersion);
    if (before.status !== 'RESERVED') {
      throw new BadRequestException(`占用记录当前状态「${before.status}」不允许入住`);
    }
    // 唯一的硬拦：这间房现在还住着别人（还没办离店），就不能再办入住
    const inHouse = await this.prisma.roomOccupancy.findFirst({
      where: { roomId: before.roomId, status: 'CHECKED_IN', id: { not: id } },
      include: { customer: { select: { name: true } } },
    });
    if (inHouse) {
      throw new ConflictException(
        `这间房现在还住着 ${inHouse.customer.name}（${inHouse.occupancyNo}，计划 ${inHouse.plannedCheckOut.toLocaleDateString()} 离店）。请先给上一位办理离店，或把这位客户换到其他空房（“预订冲突”页面可以一键换房）`,
      );
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
    await this.linkMotherProfile(updated);
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

  /**
   * 改期：调整计划入住/离店日期，不涉及状态迁移——RESERVED（还没入住，改到店日期）跟
   * CHECKED_IN（已入住，改计划离店日期，即续住/提前离店的计划调整）都允许；CHECKED_OUT/
   * CANCELLED 是终态，不允许改期。房态横排时间轴上"拖动改期"就是调这个接口。
   */
  async reschedule(id: string, dto: RescheduleRoomOccupancyDto): Promise<RoomOccupancy & { conflicts: ConflictBrief[] }> {
    const before = await this.findOneOrThrow(id);
    this.assertVersion(before, dto.version);
    if (!['RESERVED', 'CHECKED_IN'].includes(before.status)) {
      throw new BadRequestException(`占用记录当前状态「${before.status}」不允许改期`);
    }
    const plannedCheckIn = new Date(dto.plannedCheckIn);
    const plannedCheckOut = new Date(dto.plannedCheckOut);
    if (plannedCheckOut <= plannedCheckIn) {
      throw new BadRequestException('计划离店日期必须晚于计划入住日期');
    }
    const conflicts = await this.softConflicts(before.roomId, plannedCheckIn, plannedCheckOut, id);
    const updated = await runVersionedUpdate(() =>
      this.prisma.roomOccupancy.update({
        where: { id, version: dto.version },
        data: { plannedCheckIn, plannedCheckOut, version: { increment: 1 } },
      }),
    );
    await this.auditLogService.record({
      action: 'UPDATE',
      entityType: 'RoomOccupancy',
      entityId: id,
      beforeData: before,
      afterData: updated,
      changedFields: ['plannedCheckIn', 'plannedCheckOut'],
      remark: `改期：${before.plannedCheckIn.toLocaleDateString()}~${before.plannedCheckOut.toLocaleDateString()} -> ${plannedCheckIn.toLocaleDateString()}~${plannedCheckOut.toLocaleDateString()}`,
      ...this.auditCtx(),
    });
    return { ...updated, conflicts };
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
