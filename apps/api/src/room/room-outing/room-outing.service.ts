import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { RoomOuting } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { CreateRoomOutingDto } from './dto/create-room-outing.dto';
import { QueryRoomOutingDto } from './dto/query-room-outing.dto';

/** 外出管理：PLANNED -(签出)-> OUT -(签回)-> RETURNED；PLANNED -(取消)-> CANCELLED。 */
@Injectable()
export class RoomOutingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
  ) {}

  findMany(query: QueryRoomOutingDto = {}): Promise<RoomOuting[]> {
    return this.prisma.roomOuting.findMany({
      where: { tenantId: this.ctx.tenantId, occupancyId: query.occupancyId, storeId: query.storeId, status: query.status },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneOrThrow(id: string): Promise<RoomOuting> {
    const outing = await this.prisma.roomOuting.findUnique({ where: { id } });
    if (!outing) throw new NotFoundException(`RoomOuting ${id} 不存在`);
    return outing;
  }

  async create(dto: CreateRoomOutingDto): Promise<RoomOuting> {
    const occupancy = await this.prisma.roomOccupancy.findUnique({ where: { id: dto.occupancyId } });
    if (!occupancy) throw new NotFoundException(`RoomOccupancy ${dto.occupancyId} 不存在`);
    const created = await this.prisma.roomOuting.create({
      data: {
        tenantId: this.ctx.tenantId!,
        storeId: occupancy.storeId,
        occupancyId: dto.occupancyId,
        plannedOutAt: new Date(dto.plannedOutAt),
        plannedBackAt: new Date(dto.plannedBackAt),
        riskNote: dto.riskNote,
        createdBy: this.ctx.accountId!,
      },
    });
    await this.auditLogService.record({ action: 'CREATE', entityType: 'RoomOuting', entityId: created.id, afterData: created, ...this.auditCtx() });
    return created;
  }

  async checkOut(id: string, expectedVersion: number): Promise<RoomOuting> {
    const before = await this.assertVersion(id, expectedVersion);
    if (before.status !== 'PLANNED') throw new BadRequestException(`外出记录当前状态「${before.status}」不允许签出`);
    return this.transition(before, 'OUT', { actualOutAt: new Date() }, 'PLANNED -> OUT');
  }

  async checkBack(id: string, expectedVersion: number): Promise<RoomOuting> {
    const before = await this.assertVersion(id, expectedVersion);
    if (before.status !== 'OUT') throw new BadRequestException(`外出记录当前状态「${before.status}」不允许签回`);
    return this.transition(before, 'RETURNED', { actualBackAt: new Date() }, 'OUT -> RETURNED');
  }

  async cancel(id: string, cancelReason: string, expectedVersion: number): Promise<RoomOuting> {
    const before = await this.assertVersion(id, expectedVersion);
    if (before.status !== 'PLANNED') throw new BadRequestException(`外出记录当前状态「${before.status}」不允许取消`);
    return this.transition(before, 'CANCELLED', { cancelReason }, `PLANNED -> CANCELLED：${cancelReason}`);
  }

  private async assertVersion(id: string, expectedVersion: number): Promise<RoomOuting> {
    const before = await this.findOneOrThrow(id);
    if (before.version !== expectedVersion) throw new ConflictException('数据已被他人修改，请刷新后重试');
    return before;
  }

  private async transition(
    before: RoomOuting,
    status: RoomOuting['status'],
    extra: Record<string, unknown>,
    remark: string,
  ): Promise<RoomOuting> {
    const updated = await this.prisma.roomOuting.update({
      where: { id: before.id },
      data: { status, ...extra, version: { increment: 1 } },
    });
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'RoomOuting',
      entityId: before.id,
      beforeData: before,
      afterData: updated,
      remark,
      ...this.auditCtx(),
    });
    return updated;
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
